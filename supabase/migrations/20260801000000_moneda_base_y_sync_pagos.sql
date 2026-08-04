-- =============================================================================
-- Moneda base (USD) para pagos + sincronizacion de importe_pagado
-- =============================================================================
-- Problema que resuelve (bug 1):
--   El estado de cuenta sumaba `monto` sin mirar `moneda`. Un pago de 38 VES
--   (~0,05 EUR) mas otro de 38 EUR daba "76 EUR pagados" y la reserva quedaba
--   saldada. Las columnas monto_base/tasa_cambio existian pero nadie las
--   rellenaba, y nada mantenia bookings.importe_pagado ni payment_status.
--
-- Estrategia:
--   1. USD es la moneda base del sistema. exchange_rates gana eur_per_usd.
--   2. to_base_usd()/from_base_usd() convierten con la tasa vigente a una fecha.
--   3. Trigger BEFORE en booking_payments rellena tasa_cambio + monto_base y
--      RECHAZA el pago si no hay tasa para convertir (mejor fallar que contabilizar mal).
--   4. Trigger AFTER recalcula bookings.importe_pagado y payment_status desde
--      los pagos confirmados, convertidos a la moneda de la reserva.
--   5. Backfill de lo ya existente.
--
-- Idempotente.

-- =============================================================================
-- 1. exchange_rates: tasa EUR
-- =============================================================================
ALTER TABLE public.exchange_rates
    ADD COLUMN IF NOT EXISTS eur_per_usd NUMERIC(12,6)
        CHECK (eur_per_usd IS NULL OR eur_per_usd > 0);

COMMENT ON COLUMN public.exchange_rates.eur_per_usd IS
    'Euros por 1 USD. NULL si ese dia no se registro. Necesario para convertir cobros en EUR a la base USD.';

COMMENT ON COLUMN public.exchange_rates.bs_per_usd IS
    'Bolivares por 1 USD (tasa BCV).';

-- =============================================================================
-- 2. Conversion a/desde moneda base
-- =============================================================================
-- Devuelve la tasa aplicada (unidades de p_moneda por 1 USD) a la fecha dada,
-- tomando la tasa mas reciente con fecha <= p_fecha. NULL si no hay ninguna
-- utilizable; quien llame decide (los triggers abortan la operacion).
CREATE OR REPLACE FUNCTION public.rate_for_currency(p_moneda CHAR(3), p_fecha DATE)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_moneda TEXT := upper(COALESCE(p_moneda, ''));
    v_fecha  DATE := COALESCE(p_fecha, CURRENT_DATE);
    v_rate   NUMERIC;
BEGIN
    IF v_moneda = '' THEN RETURN NULL; END IF;
    IF v_moneda = 'USD' THEN RETURN 1; END IF;

    IF v_moneda = 'VES' THEN
        SELECT bs_per_usd INTO v_rate
        FROM public.exchange_rates
        WHERE fecha <= v_fecha AND bs_per_usd IS NOT NULL
        ORDER BY fecha DESC LIMIT 1;
        -- Cobros anteriores a la primera tasa registrada (hay pagos desde el
        -- 15/05 y la tasa mas antigua es del 23/05): usamos la mas antigua
        -- disponible en vez de abortar. Solo afecta al backfill historico.
        IF v_rate IS NULL THEN
            SELECT bs_per_usd INTO v_rate
            FROM public.exchange_rates
            WHERE bs_per_usd IS NOT NULL
            ORDER BY fecha ASC LIMIT 1;
        END IF;
    ELSIF v_moneda = 'EUR' THEN
        SELECT eur_per_usd INTO v_rate
        FROM public.exchange_rates
        WHERE fecha <= v_fecha AND eur_per_usd IS NOT NULL
        ORDER BY fecha DESC LIMIT 1;
        IF v_rate IS NULL THEN
            SELECT eur_per_usd INTO v_rate
            FROM public.exchange_rates
            WHERE eur_per_usd IS NOT NULL
            ORDER BY fecha ASC LIMIT 1;
        END IF;
    ELSE
        RETURN NULL;
    END IF;

    IF v_rate IS NULL OR v_rate <= 0 THEN RETURN NULL; END IF;
    RETURN v_rate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rate_for_currency(CHAR, DATE) TO authenticated;

-- monto expresado en p_moneda -> USD
CREATE OR REPLACE FUNCTION public.to_base_usd(p_monto NUMERIC, p_moneda CHAR(3), p_fecha DATE)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_rate NUMERIC;
BEGIN
    IF p_monto IS NULL THEN RETURN NULL; END IF;
    v_rate := public.rate_for_currency(p_moneda, p_fecha);
    IF v_rate IS NULL OR v_rate = 0 THEN RETURN NULL; END IF;
    RETURN ROUND(p_monto / v_rate, 2);
END;
$$;

GRANT EXECUTE ON FUNCTION public.to_base_usd(NUMERIC, CHAR, DATE) TO authenticated;

-- monto en USD -> p_moneda
CREATE OR REPLACE FUNCTION public.from_base_usd(p_monto_usd NUMERIC, p_moneda CHAR(3), p_fecha DATE)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_rate NUMERIC;
BEGIN
    IF p_monto_usd IS NULL THEN RETURN NULL; END IF;
    v_rate := public.rate_for_currency(p_moneda, p_fecha);
    IF v_rate IS NULL THEN RETURN NULL; END IF;
    RETURN ROUND(p_monto_usd * v_rate, 2);
END;
$$;

GRANT EXECUTE ON FUNCTION public.from_base_usd(NUMERIC, CHAR, DATE) TO authenticated;

-- =============================================================================
-- 3. BEFORE trigger: rellenar tasa_cambio + monto_base
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_booking_payments_fill_base()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_rate  NUMERIC;
    v_fecha DATE;
BEGIN
    NEW.moneda := upper(NEW.moneda);
    v_fecha := COALESCE(NEW.pagado_at, NOW())::date;

    -- Si el cliente ya mando una tasa explicita la respetamos (permite
    -- registrar un cobro historico con la tasa que se uso ese dia).
    v_rate := COALESCE(NEW.tasa_cambio, public.rate_for_currency(NEW.moneda, v_fecha));

    IF v_rate IS NULL OR v_rate <= 0 THEN
        RAISE EXCEPTION
            'No hay tasa de cambio registrada para % en la fecha %. Registra la tasa antes de cobrar en esa moneda.',
            NEW.moneda, v_fecha
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.tasa_cambio := v_rate;
    NEW.monto_base  := ROUND(NEW.monto / v_rate, 2);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_booking_payments_fill_base ON public.booking_payments;
CREATE TRIGGER tg_booking_payments_fill_base
    BEFORE INSERT OR UPDATE OF monto, moneda, tasa_cambio, pagado_at
    ON public.booking_payments
    FOR EACH ROW EXECUTE FUNCTION public.tg_booking_payments_fill_base();

-- =============================================================================
-- 3.bis. Retirar el sync antiguo que sumaba monedas distintas
-- =============================================================================
-- En la base remota existe `tg_bp_sync_booking` -> tg_sync_booking_importe_pagado(),
-- creado a mano y NUNCA versionado. Hace exactamente esto:
--     SELECT COALESCE(SUM(monto), 0) ... WHERE status = 'confirmed'
-- Suma `monto` sin mirar `moneda`: por eso BK-2026-0060 (38 Bs + 38 EUR) figuraba
-- como "Pagado 76,00 EUR / pendiente 0,00 / pagado".
--
-- Hay que eliminarlo SI O SI antes de instalar el nuevo. Si convivieran, ambos
-- escribirian importe_pagado y el viejo ganaria por orden alfabetico de nombre
-- de trigger (tg_bp_* corre despues de tg_booking_*), dejando el bug intacto.
DROP TRIGGER IF EXISTS tg_bp_sync_booking ON public.booking_payments;
DROP FUNCTION IF EXISTS public.tg_sync_booking_importe_pagado() CASCADE;

-- =============================================================================
-- 4. Recalculo de importe_pagado / payment_status
-- =============================================================================
-- Suma los pagos CONFIRMADOS y los expresa en la moneda de la reserva.
-- Los pagos de reservas canceladas no cuentan (bug 19).
CREATE OR REPLACE FUNCTION public.recalc_booking_payment_state(p_booking_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_total       NUMERIC;
    v_moneda      CHAR(3);
    v_status      public.booking_status;
    v_misma_mon   NUMERIC;
    v_otras_base  NUMERIC;
    v_pagado      NUMERIC;
    v_new_status  public.payment_status;
BEGIN
    IF p_booking_id IS NULL THEN RETURN; END IF;

    SELECT importe_total, moneda, status
      INTO v_total, v_moneda, v_status
    FROM public.bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Los cobros hechos EN LA MONEDA DE LA RESERVA se suman tal cual.
    -- Solo los que vienen en otra moneda pasan por la base.
    --
    -- Es deliberado no convertir EUR->USD->EUR: seria un ida y vuelta que
    -- introduce ruido de redondeo y, sobre todo, revaluaria reservas ya
    -- saldadas cada vez que se mueva la tasa EUR/USD (una reserva pagada al
    -- 100% podria mostrar un saldo residual la semana siguiente).
    SELECT
        COALESCE(SUM(bp.monto)      FILTER (WHERE upper(bp.moneda) = upper(v_moneda)), 0),
        COALESCE(SUM(bp.monto_base) FILTER (WHERE upper(bp.moneda) <> upper(v_moneda)), 0)
      INTO v_misma_mon, v_otras_base
    FROM public.booking_payments bp
    WHERE bp.booking_id = p_booking_id AND bp.status = 'confirmed';

    v_pagado := v_misma_mon
              + COALESCE(public.from_base_usd(v_otras_base, v_moneda, CURRENT_DATE), 0);

    -- El CHECK chk_bookings_pago_no_excede impide guardar mas de lo facturado;
    -- un sobrepago (o un redondeo de conversion) se topa al total y queda
    -- reflejado como 'pagado'.
    IF v_pagado > v_total THEN
        v_pagado := v_total;
    END IF;

    IF v_status = 'cancelada' THEN
        v_new_status := 'reembolsado';
    ELSIF v_pagado <= 0 THEN
        v_new_status := 'pendiente';
    ELSIF v_pagado >= v_total THEN
        v_new_status := 'pagado';
    ELSE
        v_new_status := 'parcial';
    END IF;

    UPDATE public.bookings
       SET importe_pagado = v_pagado,
           payment_status = v_new_status
     WHERE id = p_booking_id
       AND (importe_pagado IS DISTINCT FROM v_pagado
            OR payment_status IS DISTINCT FROM v_new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_booking_payment_state(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_booking_payments_sync()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.recalc_booking_payment_state(OLD.booking_id);
        RETURN OLD;
    END IF;

    PERFORM public.recalc_booking_payment_state(NEW.booking_id);
    -- Si el pago se movio de reserva, recalcular tambien la anterior.
    IF TG_OP = 'UPDATE' AND OLD.booking_id IS DISTINCT FROM NEW.booking_id THEN
        PERFORM public.recalc_booking_payment_state(OLD.booking_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_booking_payments_sync ON public.booking_payments;
CREATE TRIGGER tg_booking_payments_sync
    AFTER INSERT OR UPDATE OR DELETE ON public.booking_payments
    FOR EACH ROW EXECUTE FUNCTION public.tg_booking_payments_sync();

-- Cambiar el estado de la reserva (cancelar) tambien reevalua el pago.
CREATE OR REPLACE FUNCTION public.tg_bookings_recalc_payment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status
       OR OLD.importe_total IS DISTINCT FROM NEW.importe_total THEN
        PERFORM public.recalc_booking_payment_state(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_bookings_recalc_payment ON public.bookings;
CREATE TRIGGER tg_bookings_recalc_payment
    AFTER UPDATE OF status, importe_total ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.tg_bookings_recalc_payment();

-- =============================================================================
-- 5. Backfill
-- =============================================================================
DO $$
DECLARE
    v_missing INT;
BEGIN
    -- Tasa EUR por defecto para las fechas que ya tienen tasa Bs pero no EUR.
    -- Sin esto el backfill no puede convertir los cobros historicos en EUR.
    -- 0.92 EUR/USD es un valor de arranque: ajustalo desde Configuracion de pagos.
    UPDATE public.exchange_rates
       SET eur_per_usd = 0.92
     WHERE eur_per_usd IS NULL;

    -- Asegura que exista al menos una tasa para hoy.
    INSERT INTO public.exchange_rates (fecha, bs_per_usd, eur_per_usd, source)
    SELECT CURRENT_DATE,
           COALESCE((SELECT bs_per_usd FROM public.exchange_rates ORDER BY fecha DESC LIMIT 1), 36.50),
           COALESCE((SELECT eur_per_usd FROM public.exchange_rates ORDER BY fecha DESC LIMIT 1), 0.92),
           'manual'
    ON CONFLICT (fecha) DO NOTHING;

    -- Rellenar monto_base/tasa_cambio de los pagos historicos.
    UPDATE public.booking_payments p
       SET tasa_cambio = public.rate_for_currency(upper(p.moneda), p.pagado_at::date),
           monto_base  = public.to_base_usd(p.monto, upper(p.moneda), p.pagado_at::date)
     WHERE p.monto_base IS NULL OR p.tasa_cambio IS NULL;

    SELECT COUNT(*) INTO v_missing
    FROM public.booking_payments WHERE monto_base IS NULL;
    IF v_missing > 0 THEN
        RAISE WARNING 'Quedan % pagos sin monto_base (moneda sin tasa). Revisalos manualmente.', v_missing;
    END IF;

    -- Recalcular todas las reservas.
    PERFORM public.recalc_booking_payment_state(id) FROM public.bookings;
END $$;

-- =============================================================================
-- 6. Vista de reservas: exponer el acumulado en base para auditoria
-- =============================================================================
-- DROP + CREATE (no CREATE OR REPLACE): cambiamos la lista de columnas
-- (aparecen vehicle_plate y los acumulados en base), y CREATE OR REPLACE VIEW
-- solo admite añadir columnas AL FINAL, no reordenar ni insertar en medio.
-- De paso, la vista original nunca expuso vehicle_plate aunque el frontend ya
-- lo pintaba: llegaba siempre undefined.
DROP VIEW IF EXISTS public.bookings_with_relations;

CREATE VIEW public.bookings_with_relations AS
SELECT
    b.id, b.codigo, b.period, b.fecha_entrada, b.fecha_salida, b.huespedes,
    b.tarifa_aplicada, b.descuento_pct, b.descuento_monto,
    b.importe_total, b.importe_pagado,
    (b.importe_total - b.importe_pagado)::numeric AS importe_pendiente,
    b.moneda, b.payment_status, b.status, b.origen, b.notas, b.vehicle_plate,
    b.cancelled_at, b.cancelled_reason, b.created_by, b.created_at, b.updated_at,
    COALESCE(p.pagado_base_usd, 0)::numeric   AS importe_pagado_base_usd,
    COALESCE(p.pendiente_base_usd, 0)::numeric AS importe_pendiente_base_usd,
    jsonb_build_object(
        'id', c.id,
        'nombre', c.nombres || ' ' || c.apellidos,
        'email', c.email,
        'telefono', c.telefono
    ) AS customer,
    jsonb_build_object(
        'id', r.id,
        'numero', r.numero,
        'planta', r.planta,
        'type', rt.nombre
    ) AS room
FROM public.bookings b
JOIN public.customers c ON c.id = b.customer_id
JOIN public.rooms r ON r.id = b.room_id
JOIN public.room_types rt ON rt.id = r.room_type_id
LEFT JOIN LATERAL (
    SELECT
        COALESCE(SUM(bp.monto_base) FILTER (WHERE bp.status = 'confirmed'), 0) AS pagado_base_usd,
        COALESCE(SUM(bp.monto_base) FILTER (WHERE bp.status = 'pending_confirmation'), 0) AS pendiente_base_usd
    FROM public.booking_payments bp
    WHERE bp.booking_id = b.id
) p ON true;

GRANT SELECT ON public.bookings_with_relations TO authenticated;
