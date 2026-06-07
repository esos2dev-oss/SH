-- =============================================================================
-- Views + RPCs para que el frontend consuma agregaciones directamente.
-- =============================================================================
-- Este archivo concentra las helper functions que reemplazan los endpoints
-- agregados del backend Express previo: dashboard_today, customers_with_stats,
-- bookings_with_relations, ledger summaries, reports KPIs.
--
-- Convencion: las RPCs devuelven JSONB y se invocan via supabase.rpc('nombre').
-- Las views se consultan como tablas via supabase.from('nombre').

-- =============================================================================
-- VIEW: customers_with_stats
-- =============================================================================
-- customers + total_estancias (count de bookings finalizada/en_curso) + total_gastado
CREATE OR REPLACE VIEW public.customers_with_stats AS
SELECT
    c.*,
    COALESCE(s.total_estancias, 0)::int    AS total_estancias,
    COALESCE(s.total_gastado, 0)::numeric  AS total_gastado
FROM public.customers c
LEFT JOIN (
    SELECT
        customer_id,
        COUNT(*) FILTER (WHERE status IN ('finalizada','en_curso')) AS total_estancias,
        SUM(importe_pagado) FILTER (WHERE status IN ('finalizada','en_curso','confirmada')) AS total_gastado
    FROM public.bookings
    GROUP BY customer_id
) s ON s.customer_id = c.id;

GRANT SELECT ON public.customers_with_stats TO authenticated;

-- =============================================================================
-- VIEW: bookings_with_relations
-- =============================================================================
-- Bookings con datos joineados de customer + room, e importe_pendiente computado.
CREATE OR REPLACE VIEW public.bookings_with_relations AS
SELECT
    b.id, b.codigo, b.period, b.fecha_entrada, b.fecha_salida, b.huespedes,
    b.tarifa_aplicada, b.descuento_pct, b.descuento_monto,
    b.importe_total, b.importe_pagado,
    (b.importe_total - b.importe_pagado)::numeric AS importe_pendiente,
    b.moneda, b.payment_status, b.status, b.origen, b.notas,
    b.cancelled_at, b.cancelled_reason, b.created_by, b.created_at, b.updated_at,
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
JOIN public.room_types rt ON rt.id = r.room_type_id;

GRANT SELECT ON public.bookings_with_relations TO authenticated;

-- =============================================================================
-- VIEW: ledger_entries_with_relations
-- =============================================================================
CREATE OR REPLACE VIEW public.ledger_entries_with_relations AS
SELECT
    l.id, l.codigo, l.type, l.fecha, l.descripcion, l.monto, l.moneda, l.method,
    l.status, l.reverses_id, l.registered_by, l.created_at,
    jsonb_build_object('id', lc.id, 'nombre', lc.nombre, 'slug', lc.slug) AS category,
    CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('id', b.id, 'codigo', b.codigo) END AS booking,
    CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id', c.id, 'nombre', c.nombres || ' ' || c.apellidos) END AS customer,
    COALESCE(rc.cnt, 0)::int AS receipts_count
FROM public.ledger_entries l
JOIN public.ledger_categories lc ON lc.id = l.category_id
LEFT JOIN public.bookings b ON b.id = l.booking_id
LEFT JOIN public.customers c ON c.id = l.customer_id
LEFT JOIN (
    SELECT ledger_entry_id, COUNT(*) AS cnt
    FROM public.receipts WHERE active = true
    GROUP BY ledger_entry_id
) rc ON rc.ledger_entry_id = l.id;

GRANT SELECT ON public.ledger_entries_with_relations TO authenticated;

-- =============================================================================
-- RPC: dashboard_today(p_date date default current_date) -> jsonb
-- =============================================================================
CREATE OR REPLACE FUNCTION public.dashboard_today(p_date date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $$
DECLARE
    v_total_rooms int;
    v_rooms_occupied int;
    v_arrivals int;
    v_departures int;
    v_cleanings int;
    v_pending_payments int;
    v_result jsonb;
BEGIN
    SELECT COUNT(*) INTO v_total_rooms FROM public.rooms WHERE active = true;
    SELECT COUNT(*) INTO v_rooms_occupied FROM public.rooms WHERE active = true AND status = 'ocupada';
    SELECT COUNT(*) INTO v_arrivals FROM public.bookings WHERE date_trunc('day', fecha_entrada) = p_date AND status IN ('pendiente','confirmada');
    SELECT COUNT(*) INTO v_departures FROM public.bookings WHERE date_trunc('day', fecha_salida) = p_date AND status IN ('en_curso','confirmada');
    SELECT COUNT(*) INTO v_cleanings FROM public.rooms WHERE active = true AND status = 'limpieza';
    SELECT COUNT(*) INTO v_pending_payments FROM public.booking_payments WHERE status = 'pending_confirmation';

    v_result := jsonb_build_object(
        'kpis', jsonb_build_object(
            'arrivals_count', v_arrivals,
            'departures_count', v_departures,
            'occupancy_pct', CASE WHEN v_total_rooms = 0 THEN 0 ELSE ROUND(v_rooms_occupied::numeric * 100 / v_total_rooms) END,
            'rooms_total', v_total_rooms,
            'rooms_occupied', v_rooms_occupied,
            'pending_payments_count', v_pending_payments,
            'cleanings_pending_count', v_cleanings
        ),
        'today', jsonb_build_object(
            'arrivals', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'booking_id', b.id, 'codigo', b.codigo,
                    'customer_id', c.id, 'customer_nombre', c.nombres || ' ' || c.apellidos,
                    'customer_telefono', c.telefono,
                    'room_id', r.id, 'room_numero', r.numero,
                    'fecha_entrada', b.fecha_entrada,
                    'importe_total', b.importe_total, 'importe_pagado', b.importe_pagado,
                    'importe_pendiente', b.importe_total - b.importe_pagado,
                    'moneda', b.moneda, 'payment_status', b.payment_status, 'status', b.status
                ))
                FROM public.bookings b
                JOIN public.customers c ON c.id = b.customer_id
                JOIN public.rooms r ON r.id = b.room_id
                WHERE date_trunc('day', b.fecha_entrada) = p_date AND b.status IN ('pendiente','confirmada')
                ORDER BY b.fecha_entrada
            ), '[]'::jsonb),
            'departures', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'booking_id', b.id, 'codigo', b.codigo,
                    'customer_id', c.id, 'customer_nombre', c.nombres || ' ' || c.apellidos,
                    'customer_telefono', c.telefono,
                    'room_id', r.id, 'room_numero', r.numero,
                    'fecha_salida', b.fecha_salida,
                    'importe_pendiente', b.importe_total - b.importe_pagado,
                    'moneda', b.moneda, 'status', b.status
                ))
                FROM public.bookings b
                JOIN public.customers c ON c.id = b.customer_id
                JOIN public.rooms r ON r.id = b.room_id
                WHERE date_trunc('day', b.fecha_salida) = p_date AND b.status IN ('en_curso','confirmada')
                ORDER BY b.fecha_salida
            ), '[]'::jsonb),
            'cleanings_pending', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'room_id', id, 'numero', numero, 'planta', planta,
                    'minutes_in_state', EXTRACT(EPOCH FROM (NOW() - updated_at))::int / 60
                ))
                FROM public.rooms
                WHERE active = true AND status = 'limpieza'
                ORDER BY updated_at
            ), '[]'::jsonb),
            'birthdays', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'customer_id', id,
                    'nombre', nombres || ' ' || apellidos,
                    'edad', EXTRACT(YEAR FROM AGE(p_date, fecha_nacimiento))::int,
                    'telefono', telefono, 'email', email, 'accepts_marketing', accepts_marketing
                ))
                FROM public.customers
                WHERE fecha_nacimiento IS NOT NULL AND active = true
                    AND EXTRACT(MONTH FROM fecha_nacimiento) = EXTRACT(MONTH FROM p_date)
                    AND EXTRACT(DAY   FROM fecha_nacimiento) = EXTRACT(DAY   FROM p_date)
            ), '[]'::jsonb)
        ),
        'rooms_board', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'room_id', r.id, 'numero', r.numero, 'planta', r.planta,
                'type', rt.nombre, 'status', r.status,
                'current_booking', (
                    SELECT jsonb_build_object(
                        'id', b.id, 'codigo', b.codigo,
                        'customer_nombre', c.nombres || ' ' || c.apellidos,
                        'fecha_salida', b.fecha_salida,
                        'importe_pendiente', b.importe_total - b.importe_pagado,
                        'moneda', b.moneda
                    )
                    FROM public.bookings b
                    JOIN public.customers c ON c.id = b.customer_id
                    WHERE b.room_id = r.id AND b.status = 'en_curso'
                    ORDER BY b.fecha_entrada DESC LIMIT 1
                )
            ) ORDER BY r.numero)
            FROM public.rooms r
            JOIN public.room_types rt ON rt.id = r.room_type_id
            WHERE r.active = true
        ), '[]'::jsonb),
        'inbox', jsonb_build_object(
            'pending_payments', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'payment_id', p.id, 'monto', p.monto, 'moneda', p.moneda,
                    'method', p.method, 'referencia', p.referencia, 'pagado_at', p.pagado_at,
                    'booking_codigo', b.codigo,
                    'customer_nombre', COALESCE(c.nombres || ' ' || c.apellidos, NULL)
                ))
                FROM public.booking_payments p
                LEFT JOIN public.bookings b ON b.id = p.booking_id
                LEFT JOIN public.customers c ON c.id = COALESCE(p.customer_id, b.customer_id)
                WHERE p.status = 'pending_confirmation'
                ORDER BY p.pagado_at DESC
            ), '[]'::jsonb),
            'bookings_without_payment', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'booking_id', b.id, 'codigo', b.codigo,
                    'customer_nombre', c.nombres || ' ' || c.apellidos,
                    'room_numero', r.numero, 'fecha_entrada', b.fecha_entrada,
                    'importe_total', b.importe_total, 'moneda', b.moneda,
                    'hours_until_checkin', EXTRACT(EPOCH FROM (b.fecha_entrada - NOW()))::int / 3600
                ))
                FROM public.bookings b
                JOIN public.customers c ON c.id = b.customer_id
                JOIN public.rooms r ON r.id = b.room_id
                WHERE b.status IN ('pendiente','confirmada')
                    AND b.importe_pagado = 0
                    AND b.fecha_entrada BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
                ORDER BY b.fecha_entrada
            ), '[]'::jsonb)
        ),
        'generated_at', NOW()
    );
    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_today(date) TO authenticated;

-- =============================================================================
-- RPC: ledger_summary(p_from date, p_to date, p_group text)
-- =============================================================================
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
                'ingresos', COALESCE(SUM(monto) FILTER (WHERE type = 'ingreso'), 0),
                'egresos',  COALESCE(SUM(monto) FILTER (WHERE type = 'egreso'),  0),
                'neto',     COALESCE(SUM(CASE WHEN type = 'ingreso' THEN monto ELSE -monto END), 0),
                'moneda',   COALESCE((SELECT moneda FROM public.ledger_entries WHERE fecha BETWEEN p_from AND p_to LIMIT 1), 'USD')
            )
            FROM public.ledger_entries
            WHERE fecha BETWEEN p_from AND p_to AND status <> 'anulado'
        ),
        'byCategory', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'categoryId', lc.id, 'nombre', lc.nombre, 'type', lc.type::text, 'total', sum_total
            ))
            FROM (
                SELECT category_id, SUM(monto) AS sum_total
                FROM public.ledger_entries
                WHERE fecha BETWEEN p_from AND p_to AND status <> 'anulado'
                GROUP BY category_id
            ) g
            JOIN public.ledger_categories lc ON lc.id = g.category_id
        ), '[]'::jsonb),
        'series', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'period', to_char(period_start, 'YYYY-MM-DD'),
                'ingresos', ingresos, 'egresos', egresos
            ) ORDER BY period_start)
            FROM (
                SELECT date_trunc(v_truncfmt, fecha)::date AS period_start,
                    SUM(monto) FILTER (WHERE type = 'ingreso') AS ingresos,
                    SUM(monto) FILTER (WHERE type = 'egreso')  AS egresos
                FROM public.ledger_entries
                WHERE fecha BETWEEN p_from AND p_to AND status <> 'anulado'
                GROUP BY period_start
            ) s
        ), '[]'::jsonb)
    );
    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ledger_summary(date, date, text) TO authenticated;

-- =============================================================================
-- RPC: reports_kpis(p_from, p_to) — ocupacion, ADR, RevPAR
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
BEGIN
    SELECT COUNT(*) INTO v_total_rooms FROM public.rooms WHERE active = true;
    v_available_room_nights := v_total_rooms * v_days;

    SELECT
        COALESCE(SUM(LEAST(b.fecha_salida::date, p_to) - GREATEST(b.fecha_entrada::date, p_from)), 0),
        COALESCE(SUM(b.importe_total) FILTER (WHERE b.status IN ('finalizada','en_curso','confirmada')), 0)
    INTO v_room_nights, v_revenue
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
        'revenue', v_revenue,
        'occupancyPct', v_occ, 'adr', v_adr, 'revpar', v_revpar,
        'topRoomTypes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', rt.id, 'nombre', rt.nombre, 'bookings', t.cnt, 'revenue', t.rev))
            FROM (
                SELECT r.room_type_id, COUNT(*) AS cnt, SUM(b.importe_total) AS rev
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
-- RPC: customer_timeline(p_id)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.customer_timeline(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $$
BEGIN
    RETURN jsonb_build_object(
        'bookings', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', b.id, 'codigo', b.codigo,
                'fecha_entrada', b.fecha_entrada, 'fecha_salida', b.fecha_salida,
                'status', b.status, 'importe_total', b.importe_total::text,
                'room_numero', r.numero
            ) ORDER BY b.fecha_entrada DESC)
            FROM public.bookings b JOIN public.rooms r ON r.id = b.room_id
            WHERE b.customer_id = p_id
        ), '[]'::jsonb),
        'emails', '[]'::jsonb
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_timeline(bigint) TO authenticated;
