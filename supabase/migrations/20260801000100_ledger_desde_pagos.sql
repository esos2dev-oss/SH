-- =============================================================================
-- Conectar Pagos con el ERP + agregados contables en moneda base
-- =============================================================================
-- Problema que resuelve (bug 5):
--   Registrar un pago solo insertaba en booking_payments. Nunca se creaba un
--   asiento en ledger_entries, asi que Finanzas mostraba "Ingresos 0,00" con
--   pagos reales cobrados. Ademas convivian tres cifras distintas de "ingresos"
--   (Finanzas leia ledger_entries, Reportes/Dashboard leian bookings) y
--   ledger_summary sumaba monedas distintas como si fueran la misma.
--
-- Estrategia:
--   1. ledger_entries gana monto_base (USD) rellenado por trigger.
--   2. Confirmar un pago crea automaticamente el asiento de ingreso enlazado.
--   3. Rechazar un pago ya contabilizado genera el asiento inverso y anula el original.
--   4. ledger_summary y reports_kpis agregan SIEMPRE sobre monto_base (USD).
--   5. Backfill de los pagos confirmados que no tienen asiento.
--
-- Idempotente.

-- =============================================================================
-- 1. monto_base en ledger_entries
-- =============================================================================
ALTER TABLE public.ledger_entries
    ADD COLUMN IF NOT EXISTS monto_base NUMERIC(12,2);

COMMENT ON COLUMN public.ledger_entries.monto_base IS
    'Importe convertido a la moneda base del sistema (USD). Todos los agregados contables usan esta columna.';

CREATE OR REPLACE FUNCTION public.tg_ledger_fill_base()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    NEW.moneda := upper(NEW.moneda);
    NEW.monto_base := public.to_base_usd(NEW.monto, NEW.moneda, NEW.fecha);
    IF NEW.monto_base IS NULL THEN
        RAISE EXCEPTION
            'No hay tasa de cambio para % en la fecha %. Registra la tasa antes de crear el asiento.',
            NEW.moneda, NEW.fecha
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_ledger_fill_base ON public.ledger_entries;
CREATE TRIGGER tg_ledger_fill_base
    BEFORE INSERT OR UPDATE OF monto, moneda, fecha ON public.ledger_entries
    FOR EACH ROW EXECUTE FUNCTION public.tg_ledger_fill_base();

-- =============================================================================
-- 2. Categoria contable por defecto para cobros de alojamiento
-- =============================================================================
INSERT INTO public.ledger_categories (nombre, slug, type)
VALUES ('Alojamiento', 'alojamiento', 'ingreso')
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 3. Pago confirmado -> asiento de ingreso. Pago rechazado -> asiento inverso.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_booking_payments_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_cat_id     BIGINT;
    v_codigo     TEXT;
    v_entry_id   BIGINT;
    v_desc       TEXT;
    v_booking    RECORD;
    v_orig       public.ledger_entries;
BEGIN
    -- --- Alta: pago pasa a confirmado y aun no tiene asiento -----------------
    IF NEW.status = 'confirmed' AND NEW.ledger_entry_id IS NULL THEN
        SELECT id INTO v_cat_id FROM public.ledger_categories
        WHERE slug = 'alojamiento' LIMIT 1;
        IF v_cat_id IS NULL THEN
            SELECT id INTO v_cat_id FROM public.ledger_categories
            WHERE type = 'ingreso' AND active = true ORDER BY id LIMIT 1;
        END IF;
        IF v_cat_id IS NULL THEN
            RAISE WARNING 'Sin categoria de ingreso: el pago % no genero asiento', NEW.id;
            RETURN NEW;
        END IF;

        SELECT b.codigo, c.nombres || ' ' || c.apellidos AS cliente
          INTO v_booking
        FROM public.bookings b
        JOIN public.customers c ON c.id = b.customer_id
        WHERE b.id = NEW.booking_id;

        v_desc := COALESCE('Cobro reserva ' || v_booking.codigo, 'Cobro suelto')
                  || COALESCE(' — ' || v_booking.cliente, '')
                  || ' (' || NEW.method::text || ')';

        v_codigo := public.next_code('LG');

        INSERT INTO public.ledger_entries (
            codigo, type, category_id, fecha, descripcion,
            monto, moneda, method, booking_id, customer_id, registered_by
        ) VALUES (
            v_codigo, 'ingreso', v_cat_id, COALESCE(NEW.pagado_at, NOW())::date, v_desc,
            NEW.monto, NEW.moneda, NEW.method, NEW.booking_id, NEW.customer_id, NEW.registered_by
        ) RETURNING id INTO v_entry_id;

        UPDATE public.booking_payments
           SET ledger_entry_id = v_entry_id
         WHERE id = NEW.id;

    -- --- Baja: pago confirmado que se rechaza -> asiento inverso -------------
    -- El guard TG_OP = 'UPDATE' es obligatorio: en un INSERT el registro OLD no
    -- esta asignado y referenciar OLD.status aborta la operacion.
    ELSIF TG_OP = 'UPDATE' AND NEW.status = 'rejected' AND OLD.status = 'confirmed'
          AND NEW.ledger_entry_id IS NOT NULL THEN
        SELECT * INTO v_orig FROM public.ledger_entries WHERE id = NEW.ledger_entry_id;
        IF FOUND AND v_orig.status <> 'anulado' THEN
            v_codigo := public.next_code('LG');
            INSERT INTO public.ledger_entries (
                codigo, type, category_id, fecha, descripcion,
                monto, moneda, method, booking_id, customer_id,
                reverses_id, status, registered_by
            ) VALUES (
                v_codigo, 'egreso', v_orig.category_id, CURRENT_DATE,
                'Reverso de ' || v_orig.codigo || ' (pago rechazado)',
                v_orig.monto, v_orig.moneda, v_orig.method, v_orig.booking_id, v_orig.customer_id,
                v_orig.id, 'registrado', COALESCE(NEW.rejected_by, NEW.registered_by)
            );
            UPDATE public.ledger_entries SET status = 'anulado' WHERE id = v_orig.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_booking_payments_to_ledger ON public.booking_payments;
CREATE TRIGGER tg_booking_payments_to_ledger
    AFTER INSERT OR UPDATE OF status ON public.booking_payments
    FOR EACH ROW EXECUTE FUNCTION public.tg_booking_payments_to_ledger();

-- =============================================================================
-- 4. ledger_summary en moneda base
-- =============================================================================
DROP FUNCTION IF EXISTS public.ledger_summary(date, date, text);

CREATE OR REPLACE FUNCTION public.ledger_summary(p_from date, p_to date, p_group text DEFAULT 'day')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $$
DECLARE
    v_result jsonb;
    v_truncfmt text := CASE p_group WHEN 'month' THEN 'month' WHEN 'week' THEN 'week' ELSE 'day' END;
BEGIN
    v_result := jsonb_build_object(
        'totals', (
            SELECT jsonb_build_object(
                'ingresos', COALESCE(SUM(monto_base) FILTER (WHERE type = 'ingreso'), 0),
                'egresos',  COALESCE(SUM(monto_base) FILTER (WHERE type = 'egreso'),  0),
                'neto',     COALESCE(SUM(CASE WHEN type = 'ingreso' THEN monto_base ELSE -monto_base END), 0),
                -- Los agregados SIEMPRE van en la moneda base del sistema.
                'moneda',   'USD'
            )
            FROM public.ledger_entries
            WHERE fecha BETWEEN p_from AND p_to AND status <> 'anulado'
        ),
        'byCategory', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'categoryId', lc.id, 'nombre', lc.nombre, 'type', lc.type::text,
                'total', sum_total, 'moneda', 'USD'
            ))
            FROM (
                SELECT category_id, SUM(monto_base) AS sum_total
                FROM public.ledger_entries
                WHERE fecha BETWEEN p_from AND p_to AND status <> 'anulado'
                GROUP BY category_id
            ) g
            JOIN public.ledger_categories lc ON lc.id = g.category_id
        ), '[]'::jsonb),
        'series', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'period', to_char(period_start, 'YYYY-MM-DD'),
                'ingresos', COALESCE(ingresos, 0), 'egresos', COALESCE(egresos, 0)
            ) ORDER BY period_start)
            FROM (
                SELECT date_trunc(v_truncfmt, fecha)::date AS period_start,
                    SUM(monto_base) FILTER (WHERE type = 'ingreso') AS ingresos,
                    SUM(monto_base) FILTER (WHERE type = 'egreso')  AS egresos
                FROM public.ledger_entries
                WHERE fecha BETWEEN p_from AND p_to AND status <> 'anulado'
                GROUP BY period_start
            ) s
        ), '[]'::jsonb),
        'bookingsCount', (
            SELECT COUNT(*) FROM public.bookings
            WHERE fecha_entrada::date BETWEEN p_from AND p_to
              AND status IN ('pendiente','confirmada','en_curso','finalizada')
        )
    );
    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ledger_summary(date, date, text) TO authenticated;

-- =============================================================================
-- 5. reports_kpis: revenue en base + ocupacion por noches reales
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reports_kpis(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $$
DECLARE
    v_total_rooms int;
    v_days int := (p_to - p_from) + 1;
    v_room_nights int;
    v_revenue numeric;
    v_available_room_nights int;
    v_occ numeric;
    v_adr numeric;
    v_revpar numeric;
    v_bookings int;
BEGIN
    SELECT COUNT(*) INTO v_total_rooms FROM public.rooms WHERE active = true;
    v_available_room_nights := v_total_rooms * v_days;

    SELECT
        COALESCE(SUM(
            GREATEST(0, LEAST(b.fecha_salida::date, p_to + 1) - GREATEST(b.fecha_entrada::date, p_from))
        ), 0),
        -- Revenue en moneda base: importe_total esta en la moneda de la reserva.
        COALESCE(SUM(public.to_base_usd(b.importe_total, b.moneda, b.fecha_entrada::date)), 0),
        COUNT(*)
    INTO v_room_nights, v_revenue, v_bookings
    FROM public.bookings b
    WHERE b.fecha_entrada::date <= p_to AND b.fecha_salida::date >= p_from
        AND b.status IN ('finalizada','en_curso','confirmada');

    v_occ   := CASE WHEN v_available_room_nights = 0 THEN 0 ELSE ROUND(v_room_nights::numeric * 100 / v_available_room_nights, 2) END;
    v_adr   := CASE WHEN v_room_nights = 0 THEN 0 ELSE ROUND(v_revenue / v_room_nights, 2) END;
    v_revpar:= CASE WHEN v_available_room_nights = 0 THEN 0 ELSE ROUND(v_revenue / v_available_room_nights, 2) END;

    RETURN jsonb_build_object(
        'rangeFrom', p_from, 'rangeTo', p_to,
        'totalRooms', v_total_rooms, 'days', v_days,
        'roomNights', v_room_nights, 'availableRoomNights', v_available_room_nights,
        'revenue', v_revenue, 'moneda', 'USD', 'bookingsCount', v_bookings,
        'occupancyPct', v_occ, 'adr', v_adr, 'revpar', v_revpar,
        'topRoomTypes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', rt.id, 'nombre', rt.nombre, 'bookings', t.cnt, 'revenue', t.rev))
            FROM (
                SELECT r.room_type_id, COUNT(*) AS cnt,
                       SUM(public.to_base_usd(b.importe_total, b.moneda, b.fecha_entrada::date)) AS rev
                FROM public.bookings b
                JOIN public.rooms r ON r.id = b.room_id
                WHERE b.fecha_entrada::date BETWEEN p_from AND p_to
                    AND b.status IN ('finalizada','en_curso','confirmada')
                GROUP BY r.room_type_id
                ORDER BY rev DESC NULLS LAST
                LIMIT 5
            ) t
            JOIN public.room_types rt ON rt.id = t.room_type_id
        ), '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reports_kpis(date, date) TO authenticated;

-- =============================================================================
-- 6. Backfill: monto_base de asientos existentes + asientos de pagos ya confirmados
-- =============================================================================
DO $$
DECLARE
    v_cat_id   BIGINT;
    p          RECORD;
    v_entry_id BIGINT;
BEGIN
    UPDATE public.ledger_entries
       SET monto_base = public.to_base_usd(monto, upper(moneda), fecha)
     WHERE monto_base IS NULL;

    SELECT id INTO v_cat_id FROM public.ledger_categories WHERE slug = 'alojamiento' LIMIT 1;
    IF v_cat_id IS NULL THEN
        RAISE WARNING 'Sin categoria alojamiento: se omite el backfill de asientos';
        RETURN;
    END IF;

    FOR p IN
        SELECT bp.*, b.codigo AS booking_codigo
        FROM public.booking_payments bp
        LEFT JOIN public.bookings b ON b.id = bp.booking_id
        WHERE bp.status = 'confirmed' AND bp.ledger_entry_id IS NULL
        ORDER BY bp.pagado_at
    LOOP
        INSERT INTO public.ledger_entries (
            codigo, type, category_id, fecha, descripcion,
            monto, moneda, method, booking_id, customer_id, registered_by
        ) VALUES (
            public.next_code('LG'), 'ingreso', v_cat_id, p.pagado_at::date,
            COALESCE('Cobro reserva ' || p.booking_codigo, 'Cobro suelto')
                || ' (' || p.method::text || ') [regularizado]',
            p.monto, upper(p.moneda), p.method, p.booking_id, p.customer_id, p.registered_by
        ) RETURNING id INTO v_entry_id;

        UPDATE public.booking_payments SET ledger_entry_id = v_entry_id WHERE id = p.id;
    END LOOP;
END $$;
