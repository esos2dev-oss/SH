-- =============================================================================
-- Datos de escaparate — para las capturas de la landing
-- =============================================================================
--   docker exec -i supabase_db_sh psql -U postgres -d postgres < supabase/seeds/escaparate.sql
--
-- NO es el seed de arranque. Es un dia de operacion creible, para que las
-- capturas del producto enseñen un hotel trabajando y no una instalacion vacia:
-- un panel con todo a cero es lo peor que puede enseñar una landing, porque
-- parece un producto que no usa nadie.
--
-- Se apoya en la fecha de ejecucion, asi que las capturas siempre salen con
-- "hoy" coherente. Es idempotente: borra su propio rastro (codigos DEMO-*)
-- antes de volver a generarlo.

DO $$
DECLARE
    v_hotel   BIGINT;
    v_uid     UUID;
    v_hoy     DATE := current_date;
    v_room    RECORD;
    v_cust    BIGINT;
    v_booking BIGINT;
    v_i       INT := 0;
    v_tarifa  NUMERIC;
    v_moneda  CHAR(3);
    -- Huespedes con nombres del pais: un escaparate con "John Doe" se nota.
    v_nombres TEXT[] := ARRAY[
        'Maria|Rondon','Luis|Perdomo','Ana|Salas','Jose|Marcano','Carmen|Bastidas',
        'Rafael|Guevara','Yulimar|Contreras','Pedro|Villalobos','Daniela|Escalona',
        'Miguel|Antequera','Rosa|Chirinos','Andres|Malave'
    ];
BEGIN
    SELECT id INTO v_hotel FROM public.hotels ORDER BY id LIMIT 1;
    IF v_hotel IS NULL THEN RAISE EXCEPTION 'No hay hotel'; END IF;

    SELECT user_id INTO v_uid FROM public.hotel_members WHERE hotel_id = v_hotel LIMIT 1;
    SELECT value #>> '{}' INTO v_moneda FROM public.settings
     WHERE hotel_id = v_hotel AND key = 'hotel.moneda_base';
    v_moneda := COALESCE(v_moneda, 'USD');

    -- Limpieza de la pasada anterior.
    DELETE FROM public.booking_payments WHERE booking_id IN
        (SELECT id FROM public.bookings WHERE codigo LIKE 'DEMO-%' AND hotel_id = v_hotel);
    DELETE FROM public.bookings  WHERE codigo LIKE 'DEMO-%' AND hotel_id = v_hotel;
    DELETE FROM public.customers WHERE doc_numero LIKE 'DEMO-%' AND hotel_id = v_hotel;

    -- Tasa del dia, que es lo que se ve en varias pantallas.
    INSERT INTO public.exchange_rates (hotel_id, fecha, bs_per_usd, bs_per_eur, source)
    VALUES (NULL, v_hoy, 36.50, 39.80, 'bcv')
    ON CONFLICT (fecha, hotel_id) DO UPDATE
        SET bs_per_usd = EXCLUDED.bs_per_usd, bs_per_eur = EXCLUDED.bs_per_eur;

    -- Huespedes.
    FOR v_i IN 1..array_length(v_nombres, 1) LOOP
        INSERT INTO public.customers (hotel_id, nombres, apellidos, doc_kind, doc_numero, email, telefono)
        VALUES (
            v_hotel,
            split_part(v_nombres[v_i], '|', 1),
            split_part(v_nombres[v_i], '|', 2),
            'cedula',
            'DEMO-' || lpad(v_i::TEXT, 6, '0'),
            lower(split_part(v_nombres[v_i], '|', 1)) || '@correo.test',
            '+58 4' || (10 + v_i)::TEXT || '-' || lpad((1000000 + v_i * 37)::TEXT, 7, '0')
        );
    END LOOP;

    -- Estados de las habitaciones: un hotel real no esta todo verde.
    v_i := 0;
    FOR v_room IN SELECT r.id, rt.tarifa_dia FROM public.rooms r
                    JOIN public.room_types rt ON rt.id = r.room_type_id
                   WHERE r.hotel_id = v_hotel ORDER BY r.id
    LOOP
        v_i := v_i + 1;
        UPDATE public.rooms SET status =
            CASE
                WHEN v_i <= 9  THEN 'ocupada'::public.room_status
                WHEN v_i <= 12 THEN 'limpieza'::public.room_status
                WHEN v_i = 13  THEN 'mantenimiento'::public.room_status
                ELSE 'disponible'::public.room_status
            END
        WHERE id = v_room.id;
    END LOOP;

    -- Estancias en curso: entraron hace unos dias y salen mas adelante.
    v_i := 0;
    FOR v_room IN SELECT r.id AS room_id, rt.tarifa_dia
                    FROM public.rooms r JOIN public.room_types rt ON rt.id = r.room_type_id
                   WHERE r.hotel_id = v_hotel AND r.status = 'ocupada' ORDER BY r.id
    LOOP
        v_i := v_i + 1;
        SELECT id INTO v_cust FROM public.customers
         WHERE hotel_id = v_hotel AND doc_numero = 'DEMO-' || lpad(v_i::TEXT, 6, '0');
        CONTINUE WHEN v_cust IS NULL;

        v_tarifa := v_room.tarifa_dia;

        INSERT INTO public.bookings (
            hotel_id, codigo, customer_id, room_id, period, fecha_entrada, fecha_salida,
            huespedes, tarifa_aplicada, importe_total, importe_pagado, moneda,
            payment_status, status, origen, created_by
        ) VALUES (
            v_hotel,
            'DEMO-' || lpad(v_i::TEXT, 4, '0'),
            v_cust, v_room.room_id, 'dia',
            (v_hoy - (v_i % 4))::TIMESTAMPTZ + INTERVAL '14 hours',
            (v_hoy + (2 + v_i % 3))::TIMESTAMPTZ + INTERVAL '11 hours',
            1 + (v_i % 3), v_tarifa,
            v_tarifa * (2 + v_i % 3),
            CASE WHEN v_i % 3 = 0 THEN v_tarifa ELSE v_tarifa * (2 + v_i % 3) END,
            v_moneda,
            CASE WHEN v_i % 3 = 0 THEN 'parcial' ELSE 'pagado' END::public.payment_status,
            'en_curso', 'directo', v_uid
        ) RETURNING id INTO v_booking;

        -- Cobros repartidos entre metodos, que es el argumento del producto.
        INSERT INTO public.booking_payments (
            hotel_id, booking_id, customer_id, monto, moneda, tasa_cambio,
            method, referencia, pagado_at, status, registered_by
        ) VALUES (
            v_hotel, v_booking, v_cust,
            v_tarifa * (2 + v_i % 3),
            v_moneda,
            CASE WHEN v_moneda = 'VES' THEN 36.50 ELSE 1 END,
            (ARRAY['efectivo_usd','pago_movil','zelle','transferencia','punto_venta']::public.payment_method[])[1 + (v_i % 5)],
            CASE WHEN v_i % 5 = 1 THEN 'PM-' || lpad((4800 + v_i)::TEXT, 6, '0') ELSE NULL END,
            (v_hoy - (v_i % 3))::TIMESTAMPTZ + INTERVAL '9 hours',
            (CASE WHEN v_i = 4 THEN 'pending_confirmation' ELSE 'confirmed' END)::public.payment_confirmation_status,
            v_uid
        );
    END LOOP;

    -- Llegadas previstas para hoy: dan vida al panel.
    FOR v_i IN 10..12 LOOP
        SELECT id INTO v_cust FROM public.customers
         WHERE hotel_id = v_hotel AND doc_numero = 'DEMO-' || lpad(v_i::TEXT, 6, '0');
        SELECT r.id AS id, rt.tarifa_dia AS tarifa_dia INTO v_room
          FROM public.rooms r JOIN public.room_types rt ON rt.id = r.room_type_id
         WHERE r.hotel_id = v_hotel AND r.status = 'disponible'
         ORDER BY r.id OFFSET (v_i - 10) LIMIT 1;
        CONTINUE WHEN v_cust IS NULL OR v_room IS NULL;

        INSERT INTO public.bookings (
            hotel_id, codigo, customer_id, room_id, period, fecha_entrada, fecha_salida,
            huespedes, tarifa_aplicada, importe_total, importe_pagado, moneda,
            payment_status, status, origen, created_by
        ) VALUES (
            v_hotel, 'DEMO-L' || v_i, v_cust, v_room.id, 'dia',
            v_hoy::TIMESTAMPTZ + INTERVAL '14 hours',
            (v_hoy + 2)::TIMESTAMPTZ + INTERVAL '11 hours',
            2, v_room.tarifa_dia, v_room.tarifa_dia * 2,
            CASE WHEN v_i = 11 THEN v_room.tarifa_dia ELSE v_room.tarifa_dia * 2 END,
            v_moneda,
            CASE WHEN v_i = 11 THEN 'parcial' ELSE 'pagado' END::public.payment_status,
            'confirmada', 'directo', v_uid
        );
    END LOOP;

    RAISE NOTICE 'Escaparate listo: % habitaciones, % reservas, % cobros',
        (SELECT count(*) FROM public.rooms WHERE hotel_id = v_hotel),
        (SELECT count(*) FROM public.bookings WHERE hotel_id = v_hotel),
        (SELECT count(*) FROM public.booking_payments WHERE hotel_id = v_hotel);
END $$;
