-- =============================================================================
-- dashboard_today: orden numerico de habitaciones + comparacion de fechas por dia
-- =============================================================================
-- Cambios respecto a 20260101000600:
--   - rooms_board ordenado por numero_sort (bug 17: 1,10,11,2,3... en el tablero)
--   - fechas comparadas con ::date en vez de date_trunc, que es lo que
--     realmente significa "llega hoy" y no depende de la hora almacenada
--   - se expone checkin_permitido por llegada para que la UI no ofrezca el
--     boton de check-in fuera de ventana (bug 11)

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
    SELECT COUNT(*) INTO v_arrivals FROM public.bookings WHERE fecha_entrada::date = p_date AND status IN ('pendiente','confirmada');
    SELECT COUNT(*) INTO v_departures FROM public.bookings WHERE fecha_salida::date = p_date AND status IN ('en_curso','confirmada');
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
                    'moneda', b.moneda, 'payment_status', b.payment_status, 'status', b.status,
                    'checkin_bloqueo', public.checkin_window_violation(b.id)
                ) ORDER BY b.fecha_entrada)
                FROM public.bookings b
                JOIN public.customers c ON c.id = b.customer_id
                JOIN public.rooms r ON r.id = b.room_id
                WHERE b.fecha_entrada::date = p_date AND b.status IN ('pendiente','confirmada')
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
                ) ORDER BY b.fecha_salida)
                FROM public.bookings b
                JOIN public.customers c ON c.id = b.customer_id
                JOIN public.rooms r ON r.id = b.room_id
                WHERE b.fecha_salida::date = p_date AND b.status IN ('en_curso','confirmada')
            ), '[]'::jsonb),
            'cleanings_pending', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'room_id', id, 'numero', numero, 'planta', planta,
                    'minutes_in_state', EXTRACT(EPOCH FROM (NOW() - updated_at))::int / 60
                ) ORDER BY updated_at)
                FROM public.rooms
                WHERE active = true AND status = 'limpieza'
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
        'rooms_board', public.rooms_board(),
        'inbox', jsonb_build_object(
            'pending_payments', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'payment_id', p.id, 'monto', p.monto, 'moneda', p.moneda,
                    'monto_base', p.monto_base,
                    'method', p.method, 'referencia', p.referencia, 'pagado_at', p.pagado_at,
                    'booking_codigo', b.codigo,
                    'customer_nombre', COALESCE(c.nombres || ' ' || c.apellidos, NULL)
                ) ORDER BY p.pagado_at DESC)
                FROM public.booking_payments p
                LEFT JOIN public.bookings b ON b.id = p.booking_id
                LEFT JOIN public.customers c ON c.id = COALESCE(p.customer_id, b.customer_id)
                WHERE p.status = 'pending_confirmation'
            ), '[]'::jsonb),
            'bookings_without_payment', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'booking_id', b.id, 'codigo', b.codigo,
                    'customer_nombre', c.nombres || ' ' || c.apellidos,
                    'room_numero', r.numero, 'fecha_entrada', b.fecha_entrada,
                    'importe_total', b.importe_total, 'moneda', b.moneda,
                    'hours_until_checkin', EXTRACT(EPOCH FROM (b.fecha_entrada - NOW()))::int / 3600
                ) ORDER BY b.fecha_entrada)
                FROM public.bookings b
                JOIN public.customers c ON c.id = b.customer_id
                JOIN public.rooms r ON r.id = b.room_id
                WHERE b.status IN ('pendiente','confirmada')
                    AND b.importe_pagado = 0
                    AND b.fecha_entrada BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
            ), '[]'::jsonb)
        ),
        'generated_at', NOW()
    );
    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_today(date) TO authenticated;
