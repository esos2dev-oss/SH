-- =============================================================================
-- Datos de prueba reales para QA.
-- =============================================================================
-- Idempotente: usa ON CONFLICT donde aplica. Asume:
--  - room_types base ya cargados (seed.sql)
--  - ledger_categories base ya cargados (seed.sql)
--  - Existe al menos un profile con role superadmin (superadmin@test.com)
--
-- Insertar mas datos basicos:
--  - 8 rooms (3 sencillas, 3 dobles, 2 suites) en plantas 1 y 2
--  - 6 customers
--  - 4 bookings (1 en_curso, 1 confirmada futura, 1 pendiente, 1 finalizada)
--  - 3 payments confirmados + 1 pago_movil pendiente
--  - 3 ledger entries (1 ingreso auto + 2 egresos manuales)

DO $$
DECLARE
    v_uid uuid;
    v_sencilla bigint;
    v_doble bigint;
    v_suite bigint;
    v_alojamiento bigint;
    v_suministros bigint;
    v_servicios bigint;
    v_room_101 bigint;
    v_room_102 bigint;
    v_room_201 bigint;
    v_room_202 bigint;
    v_cust_juan bigint;
    v_cust_maria bigint;
    v_cust_pedro bigint;
    v_cust_ana bigint;
    v_book_curso bigint;
    v_book_conf bigint;
    v_book_pend bigint;
    v_book_fin bigint;
BEGIN
    -- Tomamos el primer superadmin como creador de los datos
    SELECT id INTO v_uid FROM public.profiles WHERE role = 'superadmin' AND active = true ORDER BY created_at LIMIT 1;
    IF v_uid IS NULL THEN
        RAISE NOTICE 'No hay superadmin, saltando seed de test data';
        RETURN;
    END IF;

    SELECT id INTO v_sencilla FROM public.room_types WHERE slug = 'sencilla';
    SELECT id INTO v_doble    FROM public.room_types WHERE slug = 'doble';
    SELECT id INTO v_suite    FROM public.room_types WHERE slug = 'suite';

    SELECT id INTO v_alojamiento FROM public.ledger_categories WHERE slug = 'alojamiento';
    SELECT id INTO v_suministros FROM public.ledger_categories WHERE slug = 'suministros';
    SELECT id INTO v_servicios   FROM public.ledger_categories WHERE slug = 'servicios-publicos';

    -- Rooms
    INSERT INTO public.rooms (numero, room_type_id, planta, status, notas) VALUES
        ('101', v_sencilla, '1', 'disponible',  'Vista al jardin'),
        ('102', v_sencilla, '1', 'disponible',  NULL),
        ('103', v_sencilla, '1', 'limpieza',    'Pendiente despues de check-out'),
        ('201', v_doble,    '2', 'ocupada',     NULL),
        ('202', v_doble,    '2', 'disponible',  NULL),
        ('203', v_doble,    '2', 'mantenimiento','Aire acondicionado reportado'),
        ('301', v_suite,    '3', 'disponible',  'Suite con balcon'),
        ('302', v_suite,    '3', 'disponible',  'Suite ejecutiva')
    ON CONFLICT (numero) DO NOTHING;

    SELECT id INTO v_room_101 FROM public.rooms WHERE numero = '101';
    SELECT id INTO v_room_102 FROM public.rooms WHERE numero = '102';
    SELECT id INTO v_room_201 FROM public.rooms WHERE numero = '201';
    SELECT id INTO v_room_202 FROM public.rooms WHERE numero = '202';

    -- Customers
    INSERT INTO public.customers (nombres, apellidos, doc_kind, doc_numero, email, telefono, fecha_nacimiento, nacionalidad, accepts_marketing) VALUES
        ('Juan',   'Perez',    'cedula',    'V-12345678', 'juan.perez@example.com',   '+58 414 111 1111', '1985-04-12', 'Venezolana', true),
        ('Maria',  'Gonzalez', 'cedula',    'V-23456789', 'maria.g@example.com',      '+58 412 222 2222', '1990-07-08', 'Venezolana', true),
        ('Pedro',  'Rodriguez','pasaporte', 'C01234567',  'pedro.r@example.com',      '+57 300 333 3333', '1978-11-25', 'Colombiana', false),
        ('Ana',    'Martinez', 'cedula',    'V-34567890', 'ana.m@example.com',        '+58 416 444 4444', '1995-02-14', 'Venezolana', true),
        ('Carlos', 'Sanchez',  'cedula',    'V-45678901', 'carlos.s@example.com',     '+58 424 555 5555', '1982-09-30', 'Venezolana', false),
        ('Laura',  'Diaz',     'dni',       '20123456X',  'laura.d@example.com',      '+34 612 666 6666', '1988-06-21', 'Espanola',   true)
    ON CONFLICT (doc_kind, doc_numero) DO NOTHING;

    SELECT id INTO v_cust_juan  FROM public.customers WHERE doc_numero = 'V-12345678';
    SELECT id INTO v_cust_maria FROM public.customers WHERE doc_numero = 'V-23456789';
    SELECT id INTO v_cust_pedro FROM public.customers WHERE doc_numero = 'C01234567';
    SELECT id INTO v_cust_ana   FROM public.customers WHERE doc_numero = 'V-34567890';

    -- Bookings (solo si no existen ya)
    -- 1) En curso (huesped ya hizo check-in, sale en 2 dias)
    IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE codigo = 'BK-2026-T001') THEN
        INSERT INTO public.bookings (
            codigo, customer_id, room_id, period, fecha_entrada, fecha_salida,
            huespedes, tarifa_aplicada, importe_total, importe_pagado,
            moneda, payment_status, status, origen, created_by
        ) VALUES (
            'BK-2026-T001', v_cust_juan, v_room_201, 'dia',
            NOW() - INTERVAL '1 day', NOW() + INTERVAL '2 days',
            2, 45.00, 135.00, 135.00, 'USD', 'pagado', 'en_curso', 'recepcion', v_uid
        ) RETURNING id INTO v_book_curso;
    END IF;

    -- 2) Confirmada futura (llega en 3 dias)
    IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE codigo = 'BK-2026-T002') THEN
        INSERT INTO public.bookings (
            codigo, customer_id, room_id, period, fecha_entrada, fecha_salida,
            huespedes, tarifa_aplicada, importe_total, importe_pagado,
            moneda, payment_status, status, origen, created_by
        ) VALUES (
            'BK-2026-T002', v_cust_maria, v_room_101, 'dia',
            NOW() + INTERVAL '3 days', NOW() + INTERVAL '5 days',
            1, 30.00, 60.00, 30.00, 'USD', 'parcial', 'confirmada', 'recepcion', v_uid
        ) RETURNING id INTO v_book_conf;
    END IF;

    -- 3) Pendiente (semana proxima, sin pago)
    IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE codigo = 'BK-2026-T003') THEN
        INSERT INTO public.bookings (
            codigo, customer_id, room_id, period, fecha_entrada, fecha_salida,
            huespedes, tarifa_aplicada, importe_total, importe_pagado,
            moneda, payment_status, status, origen, created_by, notas
        ) VALUES (
            'BK-2026-T003', v_cust_pedro, v_room_202, 'semana',
            NOW() + INTERVAL '7 days', NOW() + INTERVAL '14 days',
            2, 270.00, 270.00, 0.00, 'USD', 'pendiente', 'pendiente', 'web', v_uid,
            'Cliente solicito cama king-size'
        ) RETURNING id INTO v_book_pend;
    END IF;

    -- 4) Finalizada hace una semana
    IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE codigo = 'BK-2026-T004') THEN
        INSERT INTO public.bookings (
            codigo, customer_id, room_id, period, fecha_entrada, fecha_salida,
            huespedes, tarifa_aplicada, importe_total, importe_pagado,
            moneda, payment_status, status, origen, created_by
        ) VALUES (
            'BK-2026-T004', v_cust_ana, v_room_102, 'dia',
            NOW() - INTERVAL '10 days', NOW() - INTERVAL '7 days',
            1, 30.00, 90.00, 90.00, 'USD', 'pagado', 'finalizada', 'recepcion', v_uid
        ) RETURNING id INTO v_book_fin;
    END IF;

    -- Re-leer ids por si los inserts se saltaron
    SELECT id INTO v_book_curso FROM public.bookings WHERE codigo = 'BK-2026-T001';
    SELECT id INTO v_book_conf  FROM public.bookings WHERE codigo = 'BK-2026-T002';
    SELECT id INTO v_book_fin   FROM public.bookings WHERE codigo = 'BK-2026-T004';

    -- Payments
    INSERT INTO public.booking_payments (
        booking_id, customer_id, monto, moneda, method, referencia, status, registered_by, confirmed_at, confirmed_by, pagado_at
    )
    SELECT v_book_curso, v_cust_juan, 135.00, 'USD', 'tarjeta',      'TXN-T001', 'confirmed', v_uid, NOW() - INTERVAL '1 day', v_uid, NOW() - INTERVAL '1 day'
    WHERE NOT EXISTS (SELECT 1 FROM public.booking_payments WHERE referencia = 'TXN-T001');

    INSERT INTO public.booking_payments (
        booking_id, customer_id, monto, moneda, method, referencia, status, registered_by, confirmed_at, confirmed_by, pagado_at
    )
    SELECT v_book_conf, v_cust_maria, 30.00, 'USD', 'pago_movil',   '0102030405', 'confirmed', v_uid, NOW() - INTERVAL '2 days', v_uid, NOW() - INTERVAL '2 days'
    WHERE NOT EXISTS (SELECT 1 FROM public.booking_payments WHERE referencia = '0102030405');

    INSERT INTO public.booking_payments (
        booking_id, customer_id, monto, moneda, method, referencia, status, registered_by, confirmed_at, confirmed_by, pagado_at
    )
    SELECT v_book_fin, v_cust_ana, 90.00, 'USD', 'efectivo_usd', NULL, 'confirmed', v_uid, NOW() - INTERVAL '7 days', v_uid, NOW() - INTERVAL '7 days'
    WHERE NOT EXISTS (
        SELECT 1 FROM public.booking_payments WHERE booking_id = v_book_fin AND method = 'efectivo_usd'
    );

    -- Pago pendiente de confirmacion (pago_movil para la pendiente)
    INSERT INTO public.booking_payments (
        booking_id, customer_id, monto, moneda, method, referencia, method_details, status, registered_by, pagado_at
    )
    SELECT (SELECT id FROM public.bookings WHERE codigo = 'BK-2026-T003'),
           v_cust_pedro, 100.00, 'USD', 'zelle', 'ZL-T9999',
           '{"banco":"Banesco","cuenta":"0102-...-1234"}'::jsonb,
           'pending_confirmation', v_uid, NOW() - INTERVAL '2 hours'
    WHERE NOT EXISTS (SELECT 1 FROM public.booking_payments WHERE referencia = 'ZL-T9999');

    -- Ledger entries: 2 egresos manuales reales del hotel
    INSERT INTO public.ledger_entries (codigo, type, category_id, fecha, descripcion, monto, moneda, registered_by)
    SELECT 'LG-2026-T001', 'egreso', v_suministros, CURRENT_DATE - 3, 'Compra de toallas y articulos de bano', 85.50, 'USD', v_uid
    WHERE NOT EXISTS (SELECT 1 FROM public.ledger_entries WHERE codigo = 'LG-2026-T001');

    INSERT INTO public.ledger_entries (codigo, type, category_id, fecha, descripcion, monto, moneda, registered_by)
    SELECT 'LG-2026-T002', 'egreso', v_servicios, CURRENT_DATE - 1, 'Factura electricidad mes en curso', 220.00, 'USD', v_uid
    WHERE NOT EXISTS (SELECT 1 FROM public.ledger_entries WHERE codigo = 'LG-2026-T002');

    -- Ledger ingreso vinculado a booking finalizada
    INSERT INTO public.ledger_entries (codigo, type, category_id, fecha, descripcion, monto, moneda, booking_id, customer_id, registered_by)
    SELECT 'LG-2026-T003', 'ingreso', v_alojamiento, CURRENT_DATE - 7,
           'Cobro reserva BK-2026-T004', 90.00, 'USD', v_book_fin, v_cust_ana, v_uid
    WHERE NOT EXISTS (SELECT 1 FROM public.ledger_entries WHERE codigo = 'LG-2026-T003');

    -- Tasa de cambio dia actual
    INSERT INTO public.exchange_rates (fecha, bs_per_usd, source, set_by)
    VALUES (CURRENT_DATE, 36.50, 'manual', v_uid)
    ON CONFLICT (fecha) DO NOTHING;

    RAISE NOTICE 'Seed test data aplicado correctamente';
END $$;
