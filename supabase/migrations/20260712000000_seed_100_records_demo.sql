-- =============================================================================
-- Seed 100+ registros de demo para QA visual (El Pinar).
-- =============================================================================
-- Genera:
--   - 40 clientes (nombres reales, docs unicos, referral variados,
--     algunos con cumpleanos este mes)
--   - 40 reservas distribuidas en los ultimos 60 dias y proximos 30
--   - 25 pagos (mix de metodos, mayoria confirmados)
--   - 15 asientos ledger (ingresos por reservas + egresos operativos)
--   - 5 ordenes de limpieza pendientes
-- Idempotente por codigo/documento.

DO $$
DECLARE
    v_uid uuid;
    v_alojamiento bigint;
    v_servicios bigint;
    v_suministros bigint;
    v_nomina bigint;
    v_mantenimiento bigint;
    v_impuestos bigint;
    v_extra bigint;

    v_room_ids  bigint[];
    v_cust_ids  bigint[];
    v_book_ids  bigint[];

    r_id bigint; c_id bigint; b_id bigint;
    v_fecha_entrada timestamptz;
    v_fecha_salida timestamptz;
    v_dias int;
    v_tarifa numeric;
    v_total numeric;
    v_status public.booking_status;
    v_payment_status public.payment_status;
    v_pagado numeric;

    i int;
    nombres_arr text[] := ARRAY[
        'Carlos','Maria','Jose','Ana','Luis','Carmen','Pedro','Isabel','Miguel','Rosa',
        'Antonio','Lucia','Manuel','Elena','Francisco','Sofia','David','Laura','Javier','Andrea',
        'Diego','Camila','Ricardo','Valentina','Alejandro','Gabriela','Fernando','Daniela','Sebastian','Paula',
        'Ivan','Nicole','Rafael','Adriana','Gustavo','Fabiola','Oscar','Yolanda','Hugo','Beatriz'
    ];
    apellidos_arr text[] := ARRAY[
        'Garcia','Rodriguez','Gonzalez','Fernandez','Lopez','Martinez','Sanchez','Perez','Gomez','Martin',
        'Jimenez','Ruiz','Hernandez','Diaz','Moreno','Munoz','Alvarez','Romero','Alonso','Gutierrez',
        'Navarro','Torres','Dominguez','Vazquez','Ramos','Gil','Ramirez','Serrano','Blanco','Molina',
        'Suarez','Ortega','Delgado','Castro','Ortiz','Rubio','Marin','Sanz','Iglesias','Medina'
    ];
    origenes text[] := ARRAY['recepcion','web','telefono','walkin','recepcion','recepcion'];
    referral_sources public.referral_source[] := ARRAY['instagram','facebook','google','recomendacion','calle','recurrente'];
    metodos public.payment_method[] := ARRAY['efectivo_usd','tarjeta','transferencia','pago_movil','zelle','punto_venta'];
BEGIN
    SELECT id INTO v_uid FROM public.profiles WHERE role='superadmin' AND active=true ORDER BY created_at LIMIT 1;
    IF v_uid IS NULL THEN RAISE NOTICE 'Sin superadmin, saltando seed'; RETURN; END IF;

    SELECT id INTO v_alojamiento    FROM public.ledger_categories WHERE slug='alojamiento';
    SELECT id INTO v_servicios      FROM public.ledger_categories WHERE slug='servicios-publicos';
    SELECT id INTO v_suministros    FROM public.ledger_categories WHERE slug='suministros';
    SELECT id INTO v_nomina         FROM public.ledger_categories WHERE slug='nomina';
    SELECT id INTO v_mantenimiento  FROM public.ledger_categories WHERE slug='mantenimiento';
    SELECT id INTO v_impuestos      FROM public.ledger_categories WHERE slug='impuestos';
    SELECT id INTO v_extra          FROM public.ledger_categories WHERE slug='servicios-extra';

    SELECT array_agg(id ORDER BY id) INTO v_room_ids FROM public.rooms WHERE active=true;
    IF array_length(v_room_ids, 1) IS NULL OR array_length(v_room_ids, 1) < 5 THEN
        RAISE NOTICE 'Faltan habitaciones (%). Aborta.', COALESCE(array_length(v_room_ids,1), 0);
        RETURN;
    END IF;

    -- =========================================================================
    -- 1. CLIENTES (40)
    -- =========================================================================
    FOR i IN 1..40 LOOP
        DECLARE
            v_nom text := nombres_arr[1 + (i - 1) % array_length(nombres_arr, 1)];
            v_ape text := apellidos_arr[1 + (i * 3) % array_length(apellidos_arr, 1)];
            v_doc text := 'D-' || lpad((10000 + i)::text, 6, '0');
            v_ref public.referral_source := referral_sources[1 + i % array_length(referral_sources, 1)];
            v_bday date;
        BEGIN
            -- ~5 cumpleanos este mes (i multiplo de 8)
            IF i % 8 = 0 THEN
                v_bday := (date_trunc('month', CURRENT_DATE) + ((i % 27)::text || ' days')::interval)::date - INTERVAL '35 years';
            ELSE
                v_bday := (CURRENT_DATE - INTERVAL '30 years' - (i || ' days')::interval)::date;
            END IF;

            INSERT INTO public.customers (
                nombres, apellidos, doc_kind, doc_numero, email, telefono,
                fecha_nacimiento, nacionalidad, direccion, referral_source, accepts_marketing
            ) VALUES (
                v_nom, v_ape, 'cedula', v_doc,
                lower(v_nom) || '.' || lower(v_ape) || i || '@example.com',
                '+58 ' || (400 + i % 10) || '-' || lpad((1000000 + i * 137)::text, 7, '0'),
                v_bday, CASE WHEN i % 4 = 0 THEN 'Espanola' WHEN i % 4 = 1 THEN 'Colombiana' ELSE 'Venezolana' END,
                'Direccion ' || i || ', edificio ' || (i % 15 + 1),
                v_ref, i % 3 = 0
            ) ON CONFLICT (doc_kind, doc_numero) DO NOTHING;
        END;
    END LOOP;

    SELECT array_agg(id ORDER BY id) INTO v_cust_ids FROM public.customers WHERE doc_numero LIKE 'D-01%';

    -- =========================================================================
    -- 2. RESERVAS (40)
    -- =========================================================================
    v_book_ids := ARRAY[]::bigint[];
    FOR i IN 1..40 LOOP
        DECLARE
            v_offset_days int;
            v_stay_days int := 1 + (i % 6);
        BEGIN
            -- Distribuye: 15 pasadas, 10 en curso/futuras cercanas, 15 futuras
            IF i <= 15 THEN
                v_offset_days := -60 + i * 3;  -- pasadas, terminadas
            ELSIF i <= 25 THEN
                v_offset_days := -3 + (i - 15);  -- en curso o llegando
            ELSE
                v_offset_days := 5 + (i - 25) * 2;  -- futuras
            END IF;

            v_fecha_entrada := (date_trunc('day', NOW()) + (v_offset_days || ' days')::interval + INTERVAL '14 hours');
            v_fecha_salida  := v_fecha_entrada + (v_stay_days || ' days')::interval;

            r_id := v_room_ids[1 + i % array_length(v_room_ids, 1)];
            c_id := v_cust_ids[1 + i % array_length(v_cust_ids, 1)];

            -- Evita solapamientos: si ya hay booking en ese room+rango, salta
            IF EXISTS (
                SELECT 1 FROM public.bookings b
                WHERE b.room_id = r_id
                  AND b.status IN ('pendiente','confirmada','en_curso','finalizada')
                  AND tstzrange(b.fecha_entrada, b.fecha_salida, '[)') && tstzrange(v_fecha_entrada, v_fecha_salida, '[)')
            ) THEN CONTINUE; END IF;

            SELECT rt.tarifa_dia INTO v_tarifa
              FROM public.rooms rr JOIN public.room_types rt ON rt.id = rr.room_type_id
              WHERE rr.id = r_id;
            v_total := v_tarifa * v_stay_days;

            -- Estado + pagado segun temporalidad
            IF v_offset_days < -v_stay_days THEN
                v_status := 'finalizada'; v_payment_status := 'pagado'; v_pagado := v_total;
            ELSIF v_offset_days < 0 THEN
                v_status := 'en_curso'; v_payment_status := 'pagado'; v_pagado := v_total;
            ELSIF v_offset_days < 5 THEN
                v_status := 'confirmada';
                IF i % 3 = 0 THEN v_pagado := v_total; v_payment_status := 'pagado';
                ELSE v_pagado := round(v_total * 0.5, 2); v_payment_status := 'parcial'; END IF;
            ELSE
                v_status := 'pendiente';
                IF i % 4 = 0 THEN v_pagado := round(v_total * 0.5, 2); v_payment_status := 'parcial';
                ELSE v_pagado := 0; v_payment_status := 'pendiente'; END IF;
            END IF;

            INSERT INTO public.bookings (
                codigo, customer_id, room_id, period, fecha_entrada, fecha_salida,
                huespedes, tarifa_aplicada, importe_total, importe_pagado, moneda,
                payment_status, status, origen, created_by, desayunos_extra
            ) VALUES (
                public.next_code('BK'), c_id, r_id, 'dia',
                v_fecha_entrada, v_fecha_salida,
                LEAST(1 + (i % 4), 5), v_tarifa, v_total, v_pagado, 'EUR',
                v_payment_status, v_status, origenes[1 + i % array_length(origenes,1)], v_uid,
                CASE WHEN i % 7 = 0 THEN 1 WHEN i % 11 = 0 THEN -1 ELSE 0 END
            )
            RETURNING id INTO b_id;
            v_book_ids := array_append(v_book_ids, b_id);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Booking % skipped: %', i, SQLERRM;
        END;
    END LOOP;

    -- =========================================================================
    -- 3. PAGOS (~25) — todos los bookings con importe_pagado > 0 generan al menos 1
    -- =========================================================================
    i := 0;
    FOR b_id IN SELECT unnest(v_book_ids) LOOP
        DECLARE
            v_bk record;
            v_metodo public.payment_method;
        BEGIN
            SELECT customer_id, importe_pagado, moneda, fecha_entrada INTO v_bk
              FROM public.bookings WHERE id = b_id;
            IF v_bk.importe_pagado <= 0 THEN CONTINUE; END IF;

            i := i + 1;
            v_metodo := metodos[1 + i % array_length(metodos, 1)];

            INSERT INTO public.booking_payments (
                booking_id, customer_id, monto, moneda, method, referencia,
                pagado_at, status, registered_by, confirmed_at, confirmed_by
            ) VALUES (
                b_id, v_bk.customer_id, v_bk.importe_pagado, v_bk.moneda, v_metodo,
                CASE WHEN v_metodo IN ('pago_movil','zelle','transferencia') THEN 'REF' || (10000 + i) ELSE NULL END,
                v_bk.fecha_entrada - INTERVAL '1 day',
                CASE WHEN i % 8 = 0 THEN 'pending_confirmation'::public.payment_confirmation_status
                     ELSE 'confirmed'::public.payment_confirmation_status END,
                v_uid,
                CASE WHEN i % 8 = 0 THEN NULL ELSE v_bk.fecha_entrada - INTERVAL '1 day' END,
                CASE WHEN i % 8 = 0 THEN NULL ELSE v_uid END
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Payment for booking % skipped: %', b_id, SQLERRM;
        END;
    END LOOP;

    -- =========================================================================
    -- 4. LEDGER ENTRIES (15) — mix ingresos automaticos + egresos operativos
    -- =========================================================================
    -- Ingresos: para cada booking finalizada
    FOR b_id IN SELECT id FROM public.bookings WHERE status = 'finalizada' LIMIT 8 LOOP
        DECLARE v_bk record;
        BEGIN
            SELECT customer_id, importe_total, moneda, fecha_salida INTO v_bk FROM public.bookings WHERE id = b_id;
            INSERT INTO public.ledger_entries (codigo, type, category_id, fecha, descripcion, monto, moneda, booking_id, customer_id, registered_by)
            VALUES (public.next_code('LG'), 'ingreso', v_alojamiento, v_bk.fecha_salida::date,
                    'Cobro estancia', v_bk.importe_total, v_bk.moneda, b_id, v_bk.customer_id, v_uid);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;

    -- Egresos operativos (7 registros con fechas y categorias variadas)
    INSERT INTO public.ledger_entries (codigo, type, category_id, fecha, descripcion, monto, moneda, registered_by) VALUES
        (public.next_code('LG'), 'egreso', v_servicios,     CURRENT_DATE - 5,  'Factura CANTV',                       48.00, 'EUR', v_uid),
        (public.next_code('LG'), 'egreso', v_servicios,     CURRENT_DATE - 5,  'Corpoelec mes actual',                125.00,'EUR', v_uid),
        (public.next_code('LG'), 'egreso', v_suministros,   CURRENT_DATE - 8,  'Compra de amenities (jabones/champu)', 92.50,'EUR', v_uid),
        (public.next_code('LG'), 'egreso', v_suministros,   CURRENT_DATE - 12, 'Compra de sabanas y toallas',         310.00,'EUR', v_uid),
        (public.next_code('LG'), 'egreso', v_nomina,        CURRENT_DATE - 3,  'Sueldo personal limpieza (semana)',   420.00,'EUR', v_uid),
        (public.next_code('LG'), 'egreso', v_mantenimiento, CURRENT_DATE - 15, 'Reparacion tuberia hab. 8',           178.00,'EUR', v_uid),
        (public.next_code('LG'), 'egreso', v_impuestos,     CURRENT_DATE - 20, 'IVA declaracion mensual',             612.00,'EUR', v_uid);

    -- =========================================================================
    -- 5. ORDENES DE LIMPIEZA pendientes (5) para poblar la vista de limpieza
    -- =========================================================================
    -- Marca 5 habitaciones aleatorias en estado 'limpieza' y crea la orden.
    UPDATE public.rooms SET status = 'limpieza' WHERE id = ANY(v_room_ids[3:7]);

    FOR i IN 3..7 LOOP
        PERFORM public.create_cleaning_order(v_room_ids[i], NULL, 'Limpieza tras estancia');
    END LOOP;

    -- =========================================================================
    -- 6. Marca algunas habitaciones en mantenimiento (2)
    -- =========================================================================
    UPDATE public.rooms SET status = 'mantenimiento', notas = 'Aire acondicionado reportado - programado para hoy'
        WHERE numero = '2' AND status = 'disponible';
    UPDATE public.rooms SET status = 'mantenimiento', notas = 'Grifo del bano goteando'
        WHERE numero = '15' AND status = 'disponible';

    RAISE NOTICE 'Seed 100 records demo aplicado correctamente';
END $$;
