-- =============================================================================
-- Fixes + Features:
-- 1. Trigger: sincroniza bookings.importe_pagado y payment_status cuando se
--    insertan/actualizan/borran pagos. Corrige bug "pago no aparece registrado".
-- 2. Backfill de bookings existentes.
-- 3. Modulo Planta (generador): registro de encendidos/apagados con horas.
-- =============================================================================

-- ---------- Trigger sync importe_pagado ----------
CREATE OR REPLACE FUNCTION public.tg_sync_booking_importe_pagado()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_booking_id BIGINT;
    v_total NUMERIC;
    v_new_pagado NUMERIC;
BEGIN
    v_booking_id := COALESCE(NEW.booking_id, OLD.booking_id);
    IF v_booking_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

    SELECT COALESCE(SUM(monto), 0) INTO v_new_pagado
      FROM public.booking_payments
      WHERE booking_id = v_booking_id AND status = 'confirmed';

    SELECT importe_total INTO v_total FROM public.bookings WHERE id = v_booking_id;
    IF v_total IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

    UPDATE public.bookings
    SET importe_pagado = v_new_pagado,
        payment_status = CASE
            WHEN v_new_pagado <= 0                 THEN 'pendiente'::payment_status
            WHEN v_new_pagado < v_total - 0.01     THEN 'parcial'::payment_status
            ELSE 'pagado'::payment_status
        END
    WHERE id = v_booking_id;

    RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS tg_bp_sync_booking ON public.booking_payments;
CREATE TRIGGER tg_bp_sync_booking
    AFTER INSERT OR UPDATE OF status, monto, booking_id OR DELETE
    ON public.booking_payments
    FOR EACH ROW EXECUTE FUNCTION public.tg_sync_booking_importe_pagado();

-- ---------- Backfill: recalcular todos los importe_pagado historicos ----------
UPDATE public.bookings b SET
    importe_pagado = COALESCE(sums.total, 0),
    payment_status = CASE
        WHEN COALESCE(sums.total, 0) <= 0 THEN 'pendiente'::payment_status
        WHEN COALESCE(sums.total, 0) < b.importe_total - 0.01 THEN 'parcial'::payment_status
        ELSE 'pagado'::payment_status
    END
FROM (
    SELECT booking_id, SUM(monto) AS total
    FROM public.booking_payments
    WHERE status = 'confirmed'
    GROUP BY booking_id
) sums
WHERE b.id = sums.booking_id;

-- =============================================================================
-- MODULO PLANTA (generador electrico)
-- =============================================================================
DO $$ BEGIN
    CREATE TYPE public.planta_kind AS ENUM ('encendido', 'apagado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.planta_events (
    id            BIGSERIAL PRIMARY KEY,
    kind          public.planta_kind NOT NULL,
    marcado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    marcado_by    UUID REFERENCES public.profiles(id),
    motivo        TEXT,      -- por que se prendio (corte de luz, mantenimiento, prueba)
    combustible_litros NUMERIC(10,2), -- opcional: cuanto se cargo
    notas         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_planta_marcado_at ON public.planta_events (marcado_at DESC);

ALTER TABLE public.planta_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_planta_select ON public.planta_events;
CREATE POLICY p_planta_select ON public.planta_events FOR SELECT TO authenticated
    USING (public.has_role('superadmin','admin','recepcion','contabilidad','limpieza'));

DROP POLICY IF EXISTS p_planta_insert ON public.planta_events;
CREATE POLICY p_planta_insert ON public.planta_events FOR INSERT TO authenticated
    WITH CHECK (public.has_role('superadmin','admin','recepcion','limpieza'));

DROP POLICY IF EXISTS p_planta_update ON public.planta_events;
CREATE POLICY p_planta_update ON public.planta_events FOR UPDATE TO authenticated
    USING (public.has_role('superadmin','admin'))
    WITH CHECK (public.has_role('superadmin','admin'));

-- View con nombre del operador
CREATE OR REPLACE VIEW public.planta_events_view AS
SELECT
    e.id, e.kind, e.marcado_at, e.marcado_by, e.motivo,
    e.combustible_litros, e.notas, e.created_at,
    p.nombre AS operador_nombre, p.role AS operador_role
FROM public.planta_events e
LEFT JOIN public.profiles p ON p.id = e.marcado_by;

GRANT SELECT ON public.planta_events_view TO authenticated;

-- RPC: estado actual + horas encendida en rango
CREATE OR REPLACE FUNCTION public.planta_summary(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_last_kind planta_kind;
    v_last_at   timestamptz;
    v_minutos_encendida int := 0;
    v_ciclos int := 0;
    v_combustible numeric := 0;
BEGIN
    SELECT kind, marcado_at INTO v_last_kind, v_last_at
    FROM public.planta_events
    ORDER BY marcado_at DESC LIMIT 1;

    -- Sumar minutos entre pares encendido->apagado dentro del rango
    WITH pares AS (
        SELECT
            e.marcado_at AS on_at,
            (SELECT MIN(x.marcado_at) FROM public.planta_events x
                WHERE x.kind = 'apagado' AND x.marcado_at > e.marcado_at) AS off_at
        FROM public.planta_events e
        WHERE e.kind = 'encendido'
          AND e.marcado_at::date BETWEEN p_from AND p_to
    )
    SELECT
        COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(off_at, NOW()) - on_at))/60)::int, 0),
        COUNT(*)::int
      INTO v_minutos_encendida, v_ciclos
      FROM pares;

    SELECT COALESCE(SUM(combustible_litros), 0)
      INTO v_combustible
      FROM public.planta_events
      WHERE marcado_at::date BETWEEN p_from AND p_to;

    RETURN jsonb_build_object(
        'estado_actual', COALESCE(v_last_kind::text, 'apagado'),
        'ultimo_evento_at', v_last_at,
        'minutos_encendida', v_minutos_encendida,
        'horas_encendida', ROUND(v_minutos_encendida::numeric / 60, 1),
        'ciclos', v_ciclos,
        'combustible_litros', v_combustible,
        'from', p_from, 'to', p_to
    );
END $$;

GRANT EXECUTE ON FUNCTION public.planta_summary(date, date) TO authenticated;
