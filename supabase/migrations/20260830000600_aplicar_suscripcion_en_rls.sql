-- =============================================================================
-- SaaS · La suscripcion se aplica en la base de datos
-- =============================================================================
-- hotel_access_level() ya sabia decir 'full', 'read_only' o 'blocked', pero
-- nadie le hacia caso: las policies solo comprobaban hotel y rol. Un hotel con
-- la prueba vencida podia seguir creando reservas y cobrando con normalidad.
--
-- Dicho de otro modo: el producto no se cobraba solo. Y ponerlo unicamente en
-- el frontend no sirve — el aviso se salta llamando a la API directamente.
--
-- Regla que se aplica aqui:
--   full       -> lee y escribe
--   read_only  -> lee y exporta, no escribe
--   blocked    -> no lee ni escribe datos de negocio
--
-- LEER SIGUE PERMITIDO EN read_only A PROPOSITO. Un hotel que se retrasa con un
-- pago tiene que poder consultar y exportar su informacion: es su contabilidad,
-- no la nuestra. Se le corta la operacion, no el acceso a sus datos.

-- -----------------------------------------------------------------------------
-- 1. Helper de escritura
-- -----------------------------------------------------------------------------
-- Se usa en cada policy de escritura, asi que va en una funcion propia: si
-- mañana cambia la politica comercial, se cambia en un sitio y no en cincuenta.
CREATE OR REPLACE FUNCTION public.can_write_in_hotel()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT public.hotel_access_level(public.current_hotel_id()) = 'full';
$$;

REVOKE EXECUTE ON FUNCTION public.can_write_in_hotel() FROM anon;

COMMENT ON FUNCTION public.can_write_in_hotel() IS
    'true si el hotel activo tiene suscripcion o prueba vigente. Puerta de escritura del SaaS.';

-- -----------------------------------------------------------------------------
-- 2. Se añade a las policies de escritura
-- -----------------------------------------------------------------------------
-- Solo a INSERT, UPDATE, DELETE y ALL. Las de SELECT se dejan intactas para no
-- romper la lectura en modo solo lectura.
DO $$
DECLARE
    r        RECORD;
    v_qual   TEXT;
    v_check  TEXT;
    v_roles  TEXT;
    v_total  INT := 0;
    v_puerta TEXT := 'public.can_write_in_hotel()';
    tablas TEXT[] := ARRAY[
        'room_types', 'rooms', 'customers', 'bookings', 'booking_payments',
        'ledger_categories', 'ledger_entries', 'cash_closures', 'check_ins',
        'cleaning_orders', 'maintenance_orders', 'breakfast_orders',
        'staff_attendance', 'planta_events', 'receipts', 'settings',
        'bank_statements', 'bank_statement_movements'
    ];
BEGIN
    FOR r IN
        SELECT tablename, policyname, roles, cmd, qual, with_check
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = ANY(tablas)
           AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    LOOP
        -- Idempotencia.
        IF COALESCE(r.qual, '') ILIKE '%can_write_in_hotel%'
           OR COALESCE(r.with_check, '') ILIKE '%can_write_in_hotel%' THEN
            CONTINUE;
        END IF;

        v_qual  := CASE WHEN r.qual IS NULL THEN v_puerta
                        ELSE '(' || r.qual || ') AND ' || v_puerta END;
        v_check := CASE WHEN r.with_check IS NULL THEN v_puerta
                        ELSE '(' || r.with_check || ') AND ' || v_puerta END;
        v_roles := array_to_string(r.roles, ', ');

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);

        IF r.cmd = 'INSERT' THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO %s WITH CHECK (%s)',
                           r.policyname, r.tablename, v_roles, v_check);
        ELSIF r.cmd = 'DELETE' THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO %s USING (%s)',
                           r.policyname, r.tablename, v_roles, v_qual);
        ELSE  -- UPDATE y ALL
            EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (%s) WITH CHECK (%s)',
                           r.policyname, r.tablename, r.cmd, v_roles, v_qual, v_check);
        END IF;

        v_total := v_total + 1;
    END LOOP;

    RAISE NOTICE 'Policies de escritura sujetas a suscripcion: %', v_total;
END $$;

-- -----------------------------------------------------------------------------
-- 3. audit_log es la excepcion
-- -----------------------------------------------------------------------------
-- La bitacora la escriben los triggers, no los usuarios. Si se sometiera a la
-- puerta de escritura, un hotel en solo lectura dejaria de registrar quien
-- consulto que — justo cuando mas interesa que quede constancia.
-- Se deja como estaba, con su filtro de hotel.
