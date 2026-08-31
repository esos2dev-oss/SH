-- =============================================================================
-- Pruebas de aislamiento multi-tenant
-- =============================================================================
-- Se ejecuta con:
--   docker exec -i supabase_db_sh psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/aislamiento_multitenant.sql
--
-- Cada comprobacion falla con EXCEPTION, asi que ON_ERROR_STOP=1 hace que el
-- script devuelva codigo distinto de 0 y CI se entere. Un test que solo imprime
-- "mal" y sale con 0 no protege de nada.
--
-- Todo corre dentro de una transaccion que se revierte al final: no deja rastro.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.check(p_desc TEXT, p_ok BOOLEAN)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok THEN
        RAISE NOTICE '  OK   %', p_desc;
    ELSE
        RAISE EXCEPTION 'FALLO: %', p_desc;
    END IF;
END;
$$;

-- Actua como un usuario concreto dentro de la transaccion.
-- Recibe el UUID ya resuelto: buscarlo en profiles con el rol authenticated ya
-- puesto chocaria contra la propia RLS de profiles.
CREATE OR REPLACE FUNCTION pg_temp.actuar_como(p_uid TEXT, p_hotel TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    PERFORM set_config('app.hotel_id', COALESCE(p_hotel, ''), true);
END;
$$;

-- -----------------------------------------------------------------------------
-- Montaje: dos hoteles con datos propios
-- -----------------------------------------------------------------------------
DO $$
DECLARE v_a BIGINT; v_b BIGINT; v_ua UUID; v_ub UUID;
BEGIN
    SELECT id INTO v_a FROM public.hotels ORDER BY id LIMIT 1;
    IF v_a IS NULL THEN RAISE EXCEPTION 'Se necesita al menos un hotel para las pruebas'; END IF;

    INSERT INTO public.hotels (nombre, slug, plan, subscription_status)
    VALUES ('Hotel Test Aislamiento', 'hotel-test-aislamiento', 'esencial', 'trialing')
    ON CONFLICT (slug) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id INTO v_b;

    SELECT id INTO v_ua FROM public.profiles
      WHERE id IN (SELECT user_id FROM public.hotel_members WHERE hotel_id = v_a) LIMIT 1;
    IF v_ua IS NULL THEN RAISE EXCEPTION 'El hotel A no tiene miembros'; END IF;

    -- Usuario propio del hotel B. Solo se inserta en auth.users: el trigger
    -- handle_new_user crea el profile a partir de raw_user_meta_data, asi que
    -- crearlo aqui tambien chocaria con la clave primaria.
    SELECT id INTO v_ub FROM public.profiles WHERE email = 'test-aislamiento@local.test';
    IF v_ub IS NULL THEN
        v_ub := gen_random_uuid();
        INSERT INTO auth.users (id, instance_id, email, aud, role, created_at, updated_at,
                                raw_user_meta_data)
        VALUES (v_ub, '00000000-0000-0000-0000-000000000000', 'test-aislamiento@local.test',
                'authenticated', 'authenticated', now(), now(),
                '{"nombre":"Test Aislamiento","role":"admin"}'::jsonb);
    END IF;

    INSERT INTO public.hotel_members (hotel_id, user_id, role)
    VALUES (v_b, v_ub, 'owner') ON CONFLICT DO NOTHING;

    INSERT INTO public.customers (hotel_id, nombres, apellidos, doc_kind, doc_numero)
    VALUES (v_b, 'Secreto', 'Del Hotel B', 'cedula', 'V-TEST-0001')
    ON CONFLICT DO NOTHING;

    -- El hotel A necesita al menos un cliente propio para que la comparacion
    -- tenga sentido. No se da por supuesto que la base traiga datos: un test
    -- que solo pasa sobre una base "con cosas dentro" no sirve en CI.
    INSERT INTO public.customers (hotel_id, nombres, apellidos, doc_kind, doc_numero)
    VALUES (v_a, 'Cliente', 'Del Hotel A', 'cedula', 'V-TEST-000A')
    ON CONFLICT DO NOTHING;

    PERFORM set_config('test.hotel_a', v_a::text, true);
    PERFORM set_config('test.hotel_b', v_b::text, true);
    PERFORM set_config('test.uid_a', v_ua::text, true);
    PERFORM set_config('test.uid_b', v_ub::text, true);
END $$;

SET LOCAL ROLE authenticated;

-- -----------------------------------------------------------------------------
-- 1. Cada hotel ve lo suyo
-- -----------------------------------------------------------------------------
\echo ''
\echo '1. Aislamiento basico'
DO $$
DECLARE v_a_ve INT; v_b_ve INT;
BEGIN
    PERFORM pg_temp.actuar_como(current_setting('test.uid_a'));
    SELECT count(*) INTO v_a_ve FROM public.customers;
    PERFORM pg_temp.check('el hotel A ve a sus clientes', v_a_ve > 0);
    PERFORM pg_temp.check('el hotel A NO ve al cliente del hotel B',
        NOT EXISTS (SELECT 1 FROM public.customers WHERE doc_numero = 'V-TEST-0001'));

    PERFORM pg_temp.actuar_como(current_setting('test.uid_b'));
    SELECT count(*) INTO v_b_ve FROM public.customers;
    PERFORM pg_temp.check('el hotel B solo ve su unico cliente', v_b_ve = 1);
    PERFORM pg_temp.check('el hotel B NO ve las habitaciones del A',
        (SELECT count(*) FROM public.rooms) = 0);
    PERFORM pg_temp.check('el hotel B NO ve las reservas del A',
        (SELECT count(*) FROM public.bookings) = 0);
    PERFORM pg_temp.check('el hotel B NO ve la contabilidad del A',
        (SELECT count(*) FROM public.ledger_entries) = 0);
    PERFORM pg_temp.check('el hotel B NO ve la auditoria del A',
        (SELECT count(*) FROM public.audit_log) = 0);
END $$;

-- -----------------------------------------------------------------------------
-- 2. No se puede entrar en un hotel ajeno declarandolo
-- -----------------------------------------------------------------------------
\echo ''
\echo '2. Escalada por hotel_id falseado'
DO $$
BEGIN
    PERFORM pg_temp.actuar_como(current_setting('test.uid_b'), current_setting('test.hotel_a'));

    PERFORM pg_temp.check('is_member_of() rechaza el hotel ajeno',
        public.is_member_of(current_setting('test.hotel_a')::BIGINT) = false);
    PERFORM pg_temp.check('current_hotel_id() devuelve NULL con id falseado',
        public.current_hotel_id() IS NULL);
    PERFORM pg_temp.check('con id falseado no ve NINGUN cliente',
        (SELECT count(*) FROM public.customers) = 0);
    PERFORM pg_temp.check('con id falseado no ve NINGUNA habitacion',
        (SELECT count(*) FROM public.rooms) = 0);
    PERFORM pg_temp.check('con id falseado no ve NINGUN pago',
        (SELECT count(*) FROM public.booking_payments) = 0);
END $$;

-- -----------------------------------------------------------------------------
-- 3. No se puede escribir en un hotel ajeno
-- -----------------------------------------------------------------------------
\echo ''
\echo '3. Escritura cruzada'
DO $$
DECLARE v_err BOOLEAN := false;
BEGIN
    PERFORM pg_temp.actuar_como(current_setting('test.uid_b'));
    BEGIN
        INSERT INTO public.customers (hotel_id, nombres, apellidos, doc_kind, doc_numero)
        VALUES (current_setting('test.hotel_a')::BIGINT, 'Intruso', 'En hotel ajeno', 'cedula', 'V-TEST-9999');
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        v_err := true;
    END;
    PERFORM pg_temp.check('insertar en el hotel ajeno es rechazado por RLS', v_err);
END $$;

-- -----------------------------------------------------------------------------
-- 4. El rol es por hotel, no global
-- -----------------------------------------------------------------------------
\echo ''
\echo '4. Roles por hotel'
DO $$
BEGIN
    PERFORM pg_temp.actuar_como(current_setting('test.uid_b'));
    PERFORM pg_temp.check('es owner en su hotel', public.has_role_in_hotel('owner'));
    PERFORM pg_temp.check('NO es recepcion en su hotel', public.has_role_in_hotel('recepcion') = false);

    PERFORM pg_temp.actuar_como(current_setting('test.uid_b'), current_setting('test.hotel_a'));
    PERFORM pg_temp.check('no tiene ningun rol en el hotel ajeno',
        public.has_role_in_hotel('owner','admin','recepcion','limpieza','contabilidad') = false);
END $$;

-- -----------------------------------------------------------------------------
-- 5. Numeracion independiente
-- -----------------------------------------------------------------------------
\echo ''
\echo '5. Codigos por hotel'
DO $$
DECLARE v_cod_a1 TEXT; v_cod_a2 TEXT; v_cod_b TEXT;
BEGIN
    -- El hotel A gasta dos numeros de su secuencia.
    PERFORM pg_temp.actuar_como(current_setting('test.uid_a'));
    SELECT public.next_code('BK') INTO v_cod_a1;
    SELECT public.next_code('BK') INTO v_cod_a2;
    PERFORM pg_temp.check('la secuencia del hotel A avanza',
        v_cod_a1 <> v_cod_a2);

    -- El hotel B empieza por el suyo, no continua el del A: si la secuencia
    -- fuera compartida, aqui saldria el numero siguiente al del hotel A.
    PERFORM pg_temp.actuar_como(current_setting('test.uid_b'));
    SELECT public.next_code('BK') INTO v_cod_b;
    -- El hotel A ya tiene reservas numeradas; si la secuencia fuera compartida,
    -- el hotel nuevo continuaria por donde iba aquel en vez de empezar de cero.
    PERFORM pg_temp.check('el hotel nuevo empieza su numeracion en 0001',
        v_cod_b LIKE '%-0001');
    PERFORM set_config('test.cod_b', v_cod_b, true);
END $$;

-- -----------------------------------------------------------------------------
-- 6. Cobertura: ninguna tabla de negocio sin filtro de hotel
-- -----------------------------------------------------------------------------
\echo ''
\echo '6. Cobertura de policies'
RESET ROLE;
DO $$
DECLARE v_sin_filtro TEXT;
BEGIN
    -- Valen los dos patrones de aislamiento:
    --   current_hotel_id()  -> acota al hotel activo (tablas de operacion)
    --   is_member_of()      -> acota a los hoteles del usuario (tablas de cuenta,
    --                          como las invitaciones, donde acotar al hotel activo
    --                          impediria ver una invitacion antes de entrar en el)
    SELECT string_agg(tablename || '.' || policyname, ', ')
      INTO v_sin_filtro
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename NOT IN ('hotels','hotel_members','billing_events','profiles')
       AND COALESCE(qual,'')       NOT ILIKE '%current_hotel_id%'
       AND COALESCE(with_check,'') NOT ILIKE '%current_hotel_id%'
       AND COALESCE(qual,'')       NOT ILIKE '%is_member_of%'
       AND COALESCE(with_check,'') NOT ILIKE '%is_member_of%';

    PERFORM pg_temp.check(
        'todas las policies de negocio filtran por hotel' ||
        COALESCE(' (sin filtro: ' || v_sin_filtro || ')', ''),
        v_sin_filtro IS NULL);

    PERFORM pg_temp.check('ninguna tabla de negocio tiene RLS desactivado',
        NOT EXISTS (
            SELECT 1 FROM pg_tables
            WHERE schemaname = 'public' AND rowsecurity = false
        ));

    -- code_sequences: una fila por hotel, no compartida.
    PERFORM pg_temp.check('cada hotel tiene su propia secuencia de codigos',
        (SELECT count(DISTINCT hotel_id) FROM public.code_sequences) >= 2);

    -- La tabla de eventos de Stripe no la puede ver nadie salvo el webhook,
    -- que corre con service_role. RLS activo y cero policies es la forma de
    -- decir "aqui no entra ningun usuario".
    PERFORM pg_temp.check('billing_events sigue cerrada a los usuarios',
        (SELECT count(*) FROM pg_policies WHERE tablename = 'billing_events') = 0);
END $$;

-- -----------------------------------------------------------------------------
-- 7. Alta autonoma y convivencia de datos iguales
-- -----------------------------------------------------------------------------
-- Estos casos fallaban antes de 20260830000400: las unicidades eran globales,
-- asi que el segundo hotel no podia ni crear su habitacion "101".
\echo ''
\echo '7. Alta de hotel y datos que coinciden entre hoteles'
SET LOCAL ROLE authenticated;
DO $$
DECLARE
    v_nuevo BIGINT;
    v_num   TEXT;
    v_doc   TEXT;
BEGIN
    PERFORM pg_temp.actuar_como(current_setting('test.uid_b'));

    v_nuevo := public.create_hotel_with_owner('Hotel De Pruebas Automaticas', 'USD', 16);
    PERFORM pg_temp.check('un usuario puede crear su propio hotel', v_nuevo IS NOT NULL);

    PERFORM public.switch_hotel(v_nuevo);
    PERFORM pg_temp.check('el hotel nuevo arranca con sus ajustes',
        (SELECT count(*) FROM public.settings) = 3);
    PERFORM pg_temp.check('el hotel nuevo arranca con categorias contables',
        (SELECT count(*) FROM public.ledger_categories) = 6);
    PERFORM pg_temp.check('el hotel nuevo entra en prueba de 30 dias',
        (SELECT status FROM public.my_hotel_subscription()) = 'trialing');

    -- Un numero de habitacion que otro hotel ya usa.
    SELECT numero INTO v_num FROM public.rooms LIMIT 1;
    INSERT INTO public.room_types (nombre, slug, capacidad, tarifa_dia, moneda)
    VALUES ('Suite Test', 'suite-test', 2, 80, 'USD');
    INSERT INTO public.rooms (numero, room_type_id, planta, status)
    VALUES ('101', (SELECT id FROM public.room_types WHERE slug = 'suite-test'), 1, 'disponible');
    PERFORM pg_temp.check('dos hoteles pueden tener la misma habitacion "101"',
        (SELECT count(*) FROM public.rooms WHERE numero = '101') = 1);

    -- Un documento de identidad que otro hotel ya tiene registrado.
    INSERT INTO public.customers (nombres, apellidos, doc_kind, doc_numero)
    VALUES ('Huesped', 'Compartido', 'cedula', 'V-12345678');
    PERFORM pg_temp.check('un mismo huesped puede alojarse en dos hoteles',
        (SELECT count(*) FROM public.customers WHERE doc_numero = 'V-12345678') = 1);

    -- El trigger rellena hotel_id sin que el cliente lo mande.
    PERFORM pg_temp.check('hotel_id se rellena solo al insertar',
        (SELECT DISTINCT hotel_id FROM public.rooms) = v_nuevo);
END $$;

-- -----------------------------------------------------------------------------
-- 8. La suscripcion se aplica de verdad
-- -----------------------------------------------------------------------------
-- Sin esto el producto no se cobra solo: hotel_access_level() decia el estado
-- correcto pero ninguna policy le hacia caso, asi que un hotel con la prueba
-- vencida seguia operando con normalidad.
\echo ''
\echo '8. Puerta de suscripcion'
DO $$
DECLARE
    v_hotel BIGINT;
    v_pudo  BOOLEAN;
BEGIN
    v_hotel := current_setting('test.hotel_b')::BIGINT;
    PERFORM pg_temp.actuar_como(current_setting('test.uid_b'), v_hotel::TEXT);

    -- Con la prueba viva.
    PERFORM pg_temp.check('con prueba vigente puede escribir', public.can_write_in_hotel());

    -- Se agota la prueba: pasa a solo lectura.
    RESET ROLE;
    UPDATE public.hotels
       SET subscription_status = 'canceled',
           trial_ends_at       = now() - INTERVAL '1 day',
           grace_until         = now() + INTERVAL '30 days',
           data_retention_until = now() + INTERVAL '120 days'
     WHERE id = v_hotel;
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.actuar_como(current_setting('test.uid_b'), v_hotel::TEXT);

    PERFORM pg_temp.check('sin suscripcion el acceso es solo lectura',
        public.hotel_access_level(v_hotel) = 'read_only');
    PERFORM pg_temp.check('sin suscripcion no puede escribir',
        public.can_write_in_hotel() = false);

    -- Leer sigue permitido: son sus datos, no los nuestros.
    PERFORM pg_temp.check('en solo lectura SIGUE viendo sus clientes',
        (SELECT count(*) FROM public.customers) >= 1);

    v_pudo := true;
    BEGIN
        INSERT INTO public.customers (nombres, apellidos, doc_kind, doc_numero)
        VALUES ('Sin', 'Suscripcion', 'cedula', 'V-TEST-BLOQ');
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        v_pudo := false;
    END;
    PERFORM pg_temp.check('en solo lectura NO puede crear clientes', v_pudo = false);

    -- Y cuando se agota tambien la gracia: sin acceso, datos aun conservados.
    RESET ROLE;
    UPDATE public.hotels SET grace_until = now() - INTERVAL '1 day' WHERE id = v_hotel;
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.actuar_como(current_setting('test.uid_b'), v_hotel::TEXT);

    PERFORM pg_temp.check('agotada la gracia el acceso queda bloqueado',
        public.hotel_access_level(v_hotel) = 'blocked');

    RESET ROLE;
    PERFORM pg_temp.check('los datos NO se borran al bloquear',
        (SELECT count(*) FROM public.customers WHERE hotel_id = v_hotel) >= 1);
    PERFORM pg_temp.check('queda registrada la fecha hasta la que se conservan',
        (SELECT data_retention_until FROM public.hotels WHERE id = v_hotel) > now());
END $$;

\echo ''
\echo '=== TODAS LAS PRUEBAS DE AISLAMIENTO PASARON ==='

ROLLBACK;
