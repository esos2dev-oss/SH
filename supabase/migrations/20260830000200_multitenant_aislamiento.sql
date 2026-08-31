-- =============================================================================
-- SaaS · Fase 2: aislamiento real de datos entre hoteles
-- =============================================================================
-- La fase 1 (20260830000000) creo el concepto de hotel y la pertenencia N:N,
-- pero los datos de negocio seguian siendo comunes: las policies filtraban solo
-- por rol, asi que el recepcionista del Hotel A veia las reservas del Hotel B.
--
-- Esta migracion cierra eso:
--   1. hotel_id en las 21 tablas de negocio
--   2. Relleno de los datos existentes y NOT NULL
--   3. Indices por hotel_id
--   4. Trigger que rellena hotel_id solo al insertar
--   5. Reescritura de las 51 policies para exigir hotel_id = current_hotel_id()
--   6. code_sequences por hotel (numeracion independiente)
--
-- IDEMPOTENTE: se puede aplicar varias veces sin efectos.

-- -----------------------------------------------------------------------------
-- 1. hotel_id en las tablas de negocio
-- -----------------------------------------------------------------------------
-- profiles NO lleva hotel_id: una persona puede estar en varios hoteles y esa
-- relacion vive en hotel_members.
--
-- exchange_rates es el unico caso especial y lo lleva NULLABLE a proposito:
-- NULL significa "tasa global" (la del BCV, que es publica y la misma para
-- todos, y la sincroniza un solo cron), y un hotel_id concreto significa "tasa
-- propia de este hotel". Asi no se duplica la sincronizacion por cliente pero
-- cada hotel puede fijar la suya a mano si quiere.
DO $$
DECLARE
    t TEXT;
    tablas TEXT[] := ARRAY[
        'room_types', 'rooms', 'customers', 'bookings', 'booking_payments',
        'ledger_categories', 'ledger_entries', 'cash_closures', 'check_ins',
        'cleaning_orders', 'maintenance_orders', 'breakfast_orders',
        'staff_attendance', 'planta_events', 'receipts', 'settings',
        'audit_log', 'bank_statements', 'bank_statement_movements'
    ];
BEGIN
    FOREACH t IN ARRAY tablas LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format(
                'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS hotel_id BIGINT REFERENCES public.hotels(id) ON DELETE CASCADE',
                t
            );
        END IF;
    END LOOP;

    -- Tasa de cambio: global (NULL) o propia del hotel.
    IF to_regclass('public.exchange_rates') IS NOT NULL THEN
        ALTER TABLE public.exchange_rates
            ADD COLUMN IF NOT EXISTS hotel_id BIGINT REFERENCES public.hotels(id) ON DELETE CASCADE;
        COMMENT ON COLUMN public.exchange_rates.hotel_id IS
            'NULL = tasa global compartida (BCV). Con valor = tasa propia de ese hotel.';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Relleno y NOT NULL
-- -----------------------------------------------------------------------------
-- Los datos que ya existen son de un hotel real: se le asignan antes de exigir
-- la columna. Si no hubiera ningun hotel, no se fuerza NOT NULL para no dejar la
-- migracion a medias en una base vacia.
DO $$
DECLARE
    t TEXT;
    v_hotel_id BIGINT;
    tablas TEXT[] := ARRAY[
        'room_types', 'rooms', 'customers', 'bookings', 'booking_payments',
        'ledger_categories', 'ledger_entries', 'cash_closures', 'check_ins',
        'cleaning_orders', 'maintenance_orders', 'breakfast_orders',
        'staff_attendance', 'planta_events', 'receipts', 'settings',
        'audit_log', 'bank_statements', 'bank_statement_movements'
    ];
BEGIN
    SELECT id INTO v_hotel_id FROM public.hotels ORDER BY id LIMIT 1;
    IF v_hotel_id IS NULL THEN
        RAISE NOTICE 'Sin hoteles: se omite el relleno y el NOT NULL';
        RETURN;
    END IF;

    FOREACH t IN ARRAY tablas LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('UPDATE public.%I SET hotel_id = %L WHERE hotel_id IS NULL', t, v_hotel_id);
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN hotel_id SET NOT NULL', t);
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN hotel_id SET DEFAULT NULL', t);
        END IF;
    END LOOP;

    RAISE NOTICE 'Datos existentes asignados al hotel %', v_hotel_id;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Indices
-- -----------------------------------------------------------------------------
-- Sin esto, cada consulta filtrada por hotel hace recorrido completo y el
-- sistema se degrada segun entran clientes.
DO $$
DECLARE
    t TEXT;
    tablas TEXT[] := ARRAY[
        'room_types', 'rooms', 'customers', 'bookings', 'booking_payments',
        'ledger_categories', 'ledger_entries', 'cash_closures', 'check_ins',
        'cleaning_orders', 'maintenance_orders', 'breakfast_orders',
        'staff_attendance', 'planta_events', 'receipts', 'settings',
        'audit_log', 'bank_statements', 'bank_statement_movements', 'exchange_rates'
    ];
BEGIN
    FOREACH t IN ARRAY tablas LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_hotel ON public.%I (hotel_id)', t, t);
        END IF;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Relleno automatico al insertar
-- -----------------------------------------------------------------------------
-- Sin esto habria que tocar cada INSERT del frontend para que mandara hotel_id,
-- y bastaria olvidarse en un sitio para que la fila naciera huerfana o, peor,
-- en el hotel equivocado. El trigger lo resuelve en un unico lugar.
CREATE OR REPLACE FUNCTION public.tg_set_hotel_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.hotel_id IS NULL THEN
        NEW.hotel_id := public.current_hotel_id();
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_set_hotel_id() FROM anon, authenticated, public;

DO $$
DECLARE
    t TEXT;
    tablas TEXT[] := ARRAY[
        'room_types', 'rooms', 'customers', 'bookings', 'booking_payments',
        'ledger_categories', 'ledger_entries', 'cash_closures', 'check_ins',
        'cleaning_orders', 'maintenance_orders', 'breakfast_orders',
        'staff_attendance', 'planta_events', 'receipts', 'settings',
        'audit_log', 'bank_statements', 'bank_statement_movements'
    ];
BEGIN
    FOREACH t IN ARRAY tablas LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_hotel_id ON public.%I', t, t);
            EXECUTE format(
                'CREATE TRIGGER trg_%s_hotel_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_hotel_id()',
                t, t
            );
        END IF;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Reescritura de las policies
-- -----------------------------------------------------------------------------
-- Cada policy existente se recrea conservando su condicion de rol y añadiendo
-- el filtro de hotel. Se hace por SQL dinamico y no a mano porque son 51:
-- escribirlas una a una es justo la clase de tarea donde se cuela un olvido, y
-- un olvido aqui es una fuga de datos entre clientes.
--
-- Marca anti-doble-aplicacion: si la condicion ya menciona current_hotel_id, se
-- deja como esta.
DO $$
DECLARE
    r          RECORD;
    v_qual     TEXT;
    v_check    TEXT;
    v_cmd      TEXT;
    v_roles    TEXT;
    v_sql      TEXT;
    v_filtro   TEXT := 'hotel_id = public.current_hotel_id()';
    v_total    INT := 0;
    tablas TEXT[] := ARRAY[
        'room_types', 'rooms', 'customers', 'bookings', 'booking_payments',
        'ledger_categories', 'ledger_entries', 'cash_closures', 'check_ins',
        'cleaning_orders', 'maintenance_orders', 'breakfast_orders',
        'staff_attendance', 'planta_events', 'receipts', 'settings',
        'audit_log', 'bank_statements', 'bank_statement_movements', 'exchange_rates'
    ];
BEGIN
    FOR r IN
        SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = ANY(tablas)
    LOOP
        -- Ya lleva el filtro: no se toca.
        IF COALESCE(r.qual, '') ILIKE '%current_hotel_id%'
           OR COALESCE(r.with_check, '') ILIKE '%current_hotel_id%' THEN
            CONTINUE;
        END IF;

        -- exchange_rates admite la tasa global (hotel_id NULL) ademas de la propia.
        IF r.tablename = 'exchange_rates' THEN
            v_filtro := '(hotel_id IS NULL OR hotel_id = public.current_hotel_id())';
        ELSE
            v_filtro := 'hotel_id = public.current_hotel_id()';
        END IF;

        v_qual  := CASE WHEN r.qual IS NULL THEN v_filtro
                        ELSE '(' || v_filtro || ') AND (' || r.qual || ')' END;
        v_check := CASE WHEN r.with_check IS NULL THEN v_filtro
                        ELSE '(' || v_filtro || ') AND (' || r.with_check || ')' END;

        v_cmd   := r.cmd;
        v_roles := array_to_string(r.roles, ', ');

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);

        -- INSERT solo admite WITH CHECK; SELECT y DELETE solo USING.
        IF v_cmd = 'INSERT' THEN
            v_sql := format('CREATE POLICY %I ON public.%I FOR INSERT TO %s WITH CHECK (%s)',
                            r.policyname, r.tablename, v_roles, v_check);
        ELSIF v_cmd IN ('SELECT', 'DELETE') THEN
            v_sql := format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (%s)',
                            r.policyname, r.tablename, v_cmd, v_roles, v_qual);
        ELSE  -- UPDATE y ALL
            v_sql := format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (%s) WITH CHECK (%s)',
                            r.policyname, r.tablename, v_cmd, v_roles, v_qual, v_check);
        END IF;

        EXECUTE v_sql;
        v_total := v_total + 1;
    END LOOP;

    RAISE NOTICE 'Policies reescritas con filtro de hotel: %', v_total;
END $$;

-- -----------------------------------------------------------------------------
-- 6. code_sequences por hotel
-- -----------------------------------------------------------------------------
-- Los codigos BK-2026-0001 eran globales: dos hoteles compartirian la numeracion
-- de sus reservas y asientos contables. Para un contable eso es inaceptable, y
-- ademas deja ver cuantas reservas tiene el vecino.
DO $$
BEGIN
    IF to_regclass('public.code_sequences') IS NULL THEN
        RETURN;
    END IF;

    ALTER TABLE public.code_sequences
        ADD COLUMN IF NOT EXISTS hotel_id BIGINT REFERENCES public.hotels(id) ON DELETE CASCADE;

    UPDATE public.code_sequences
       SET hotel_id = (SELECT id FROM public.hotels ORDER BY id LIMIT 1)
     WHERE hotel_id IS NULL
       AND EXISTS (SELECT 1 FROM public.hotels);

    -- La PK pasa de (prefix, year) a (hotel_id, prefix, year).
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'public.code_sequences'::regclass
          AND c.contype = 'p'
          AND a.attname = 'hotel_id'
    ) THEN
        ALTER TABLE public.code_sequences ALTER COLUMN hotel_id SET NOT NULL;
        EXECUTE (
            SELECT format('ALTER TABLE public.code_sequences DROP CONSTRAINT %I', conname)
            FROM pg_constraint
            WHERE conrelid = 'public.code_sequences'::regclass AND contype = 'p'
        );
        ALTER TABLE public.code_sequences ADD PRIMARY KEY (hotel_id, prefix, year);
        RAISE NOTICE 'code_sequences: numeracion ahora independiente por hotel';
    END IF;
END $$;

-- next_code() pasa a numerar dentro del hotel activo.
CREATE OR REPLACE FUNCTION public.next_code(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    y          INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
    v_hotel_id BIGINT  := public.current_hotel_id();
    n          INTEGER;
BEGIN
    IF v_hotel_id IS NULL THEN
        RAISE EXCEPTION 'No hay hotel activo en la sesion'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO public.code_sequences (hotel_id, prefix, year, counter)
    VALUES (v_hotel_id, p_prefix, y, 1)
    ON CONFLICT (hotel_id, prefix, year)
    DO UPDATE SET counter = public.code_sequences.counter + 1
    RETURNING counter INTO n;

    RETURN p_prefix || '-' || y || '-' || lpad(n::TEXT, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_code(TEXT) FROM anon;
