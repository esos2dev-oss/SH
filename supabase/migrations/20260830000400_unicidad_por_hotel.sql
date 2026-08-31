-- =============================================================================
-- SaaS · Unicidad por hotel (no global)
-- =============================================================================
-- Las restricciones de unicidad venian del diseño mono-hotel y son globales.
-- Con varios clientes eso no solo es incorrecto, es que IMPIDE OPERAR:
--
--   rooms.numero UNIQUE          -> un solo hotel en todo el sistema puede
--                                   tener la habitacion "101"
--   customers (doc_kind,doc_num) -> un huesped solo puede alojarse en un hotel
--   room_types.nombre/slug       -> un solo hotel puede tener una "Suite"
--   ledger_categories.slug       -> un solo hotel puede tener "Alojamiento"
--   settings PK (key)            -> los ajustes serian comunes a todos
--   exchange_rates PK (fecha)    -> una sola tasa por dia en todo el sistema
--   bookings/ledger/cash codigo  -> colision de numeracion entre hoteles
--
-- El segundo cliente se topaba con esto en su primer minuto de uso.
-- Todas pasan a incluir hotel_id.

-- -----------------------------------------------------------------------------
-- 1. Unicidades compuestas
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    v_cols TEXT;
BEGIN
    FOR r IN
        SELECT c.conrelid::regclass::TEXT AS tabla,
               c.conname,
               (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY array_position(c.conkey, a.attnum))
                  FROM pg_attribute a
                 WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)) AS columnas
          FROM pg_constraint c
         WHERE c.contype = 'u'
           AND c.connamespace = 'public'::regnamespace
           -- solo tablas que ya tienen hotel_id
           AND EXISTS (SELECT 1 FROM pg_attribute a
                        WHERE a.attrelid = c.conrelid AND a.attname = 'hotel_id'
                          AND NOT a.attisdropped)
           -- y cuya unicidad todavia no lo incluye
           AND NOT EXISTS (SELECT 1 FROM pg_attribute a
                            WHERE a.attrelid = c.conrelid AND a.attname = 'hotel_id'
                              AND a.attnum = ANY(c.conkey))
           -- el token de invitacion SI debe ser unico globalmente: es la credencial
           AND c.conname <> 'hotel_invitations_token_key'
    LOOP
        EXECUTE format('ALTER TABLE public.%s DROP CONSTRAINT %I', r.tabla, r.conname);
        EXECUTE format('ALTER TABLE public.%s ADD CONSTRAINT %I UNIQUE (hotel_id, %s)',
                       r.tabla, r.conname, r.columnas);
        RAISE NOTICE 'Unicidad por hotel: %.% (%)', r.tabla, r.conname, r.columnas;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. settings: la clave primaria era (key)
-- -----------------------------------------------------------------------------
-- Con PK global, el nombre o el IVA del hotel A sobrescribian los del B. Es lo
-- que hacia que un hotel recien creado se quedara sin sus ajustes iniciales.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'public.settings'::regclass AND c.contype = 'p' AND a.attname = 'hotel_id'
    ) THEN
        ALTER TABLE public.settings DROP CONSTRAINT settings_pkey;
        ALTER TABLE public.settings ADD PRIMARY KEY (hotel_id, key);
        RAISE NOTICE 'settings: clave primaria ahora (hotel_id, key)';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. exchange_rates: la clave primaria era (fecha)
-- -----------------------------------------------------------------------------
-- hotel_id NULL significa "tasa global del BCV", compartida por todos. Con
-- NULLS NOT DISTINCT, Postgres trata esos NULL como un mismo valor y sigue
-- garantizando una sola tasa global por dia — sin eso se podrian colar
-- duplicados de la tasa oficial, que es justo lo que la PK evitaba.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'public.exchange_rates'::regclass AND c.contype = 'p' AND a.attname = 'hotel_id'
    ) THEN
        ALTER TABLE public.exchange_rates DROP CONSTRAINT exchange_rates_pkey;
        ALTER TABLE public.exchange_rates
            ADD CONSTRAINT exchange_rates_fecha_hotel_key UNIQUE NULLS NOT DISTINCT (fecha, hotel_id);
        -- Sin PK hace falta un id propio para poder referenciar filas.
        ALTER TABLE public.exchange_rates ADD COLUMN IF NOT EXISTS id BIGINT GENERATED ALWAYS AS IDENTITY;
        ALTER TABLE public.exchange_rates ADD PRIMARY KEY (id);
        RAISE NOTICE 'exchange_rates: unicidad ahora (fecha, hotel_id) con NULLS NOT DISTINCT';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Comprobacion
-- -----------------------------------------------------------------------------
DO $$
DECLARE v_pendientes TEXT;
BEGIN
    SELECT string_agg(c.conrelid::regclass::TEXT || '.' || c.conname, ', ')
      INTO v_pendientes
      FROM pg_constraint c
     WHERE c.contype IN ('u','p')
       AND c.connamespace = 'public'::regnamespace
       AND c.conname NOT LIKE '%_pkey'
       AND c.conname <> 'hotel_invitations_token_key'
       AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.conrelid AND a.attname = 'hotel_id' AND NOT a.attisdropped)
       AND NOT EXISTS (SELECT 1 FROM pg_attribute a
                        WHERE a.attrelid = c.conrelid AND a.attname = 'hotel_id' AND a.attnum = ANY(c.conkey));

    IF v_pendientes IS NOT NULL THEN
        RAISE EXCEPTION 'Quedan unicidades globales sin hotel_id: %', v_pendientes;
    END IF;
    RAISE NOTICE 'Todas las unicidades son por hotel';
END $$;
