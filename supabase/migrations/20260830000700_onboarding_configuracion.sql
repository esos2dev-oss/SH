-- =============================================================================
-- SaaS · Configuracion guiada del alta
-- =============================================================================
-- El alta pedia nombre, moneda e IVA. Suficiente para crear la fila, insuficiente
-- para que el hotel pueda trabajar: entraba a un sistema sin habitaciones, con
-- todos los modulos visibles (incluidos los que no usa) y con metodos de cobro
-- que no acepta.
--
-- Esta migracion añade lo que hace falta para configurarlo de una vez:
--   1. Tipo de alojamiento y modulos activos
--   2. Metodos de cobro aceptados
--   3. create_hotel_onboarding(): crea hotel + tipos + habitaciones + ajustes

-- -----------------------------------------------------------------------------
-- 1. Tipo de alojamiento
-- -----------------------------------------------------------------------------
-- Cambia el vocabulario de la interfaz: una posada no llama "habitaciones" a
-- sus cabañas, y ver la palabra equivocada en cada pantalla es el primer motivo
-- para pensar "esto no esta hecho para mi".
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_alojamiento') THEN
        CREATE TYPE public.tipo_alojamiento AS ENUM (
            'hotel', 'posada', 'cabanas', 'apartamentos', 'hostal'
        );
    END IF;
END $$;

ALTER TABLE public.hotels
    ADD COLUMN IF NOT EXISTS tipo public.tipo_alojamiento NOT NULL DEFAULT 'hotel';

COMMENT ON COLUMN public.hotels.tipo IS
    'Ajusta el vocabulario de la interfaz (habitacion / cabaña / apartamento).';

-- -----------------------------------------------------------------------------
-- 2. Alta guiada
-- -----------------------------------------------------------------------------
-- Recibe la configuracion del asistente y deja el hotel listo para operar.
--
-- Los tipos de alojamiento llegan como JSON en vez de como parametros sueltos
-- porque su numero es variable. Se validan uno a uno: es entrada del usuario y
-- entra directa a la base de datos.
CREATE OR REPLACE FUNCTION public.create_hotel_onboarding(
    p_nombre        TEXT,
    p_tipo          TEXT DEFAULT 'hotel',
    p_moneda_base   TEXT DEFAULT 'USD',
    p_iva_pct       NUMERIC DEFAULT 16,
    -- [{"nombre":"Doble","capacidad":2,"tarifa":40,"cantidad":6}, ...]
    p_tipos         JSONB DEFAULT '[]'::JSONB,
    -- ["efectivo_usd","pago_movil","zelle"]
    p_metodos       JSONB DEFAULT '[]'::JSONB,
    -- ["desayunos","mantenimiento","asistencia","planta"]
    p_modulos       JSONB DEFAULT '[]'::JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_hotel_id  BIGINT;
    v_tipo      JSONB;
    v_type_id   BIGINT;
    v_slug      TEXT;
    v_nombre_t  TEXT;
    v_cap       INT;
    v_tarifa    NUMERIC;
    v_cantidad  INT;
    v_numero    INT := 0;
    v_i         INT;
BEGIN
    -- El hotel, con las validaciones que ya hacia el alta simple.
    v_hotel_id := public.create_hotel_with_owner(p_nombre, p_moneda_base, p_iva_pct);

    IF p_tipo IS NOT NULL AND p_tipo <> '' THEN
        BEGIN
            UPDATE public.hotels SET tipo = p_tipo::public.tipo_alojamiento WHERE id = v_hotel_id;
        EXCEPTION WHEN invalid_text_representation THEN
            -- Un tipo desconocido no puede tumbar el alta entera: se queda el
            -- valor por defecto y el hotel entra igual.
            RAISE NOTICE 'Tipo de alojamiento no reconocido: %', p_tipo;
        END;
    END IF;

    -- Ajustes de la configuracion guiada.
    INSERT INTO public.settings (hotel_id, key, value) VALUES
        (v_hotel_id, 'hotel.tipo',     to_jsonb(COALESCE(p_tipo, 'hotel'))),
        (v_hotel_id, 'pagos.metodos',  COALESCE(p_metodos, '[]'::JSONB)),
        (v_hotel_id, 'modulos.activos', COALESCE(p_modulos, '[]'::JSONB))
    ON CONFLICT (hotel_id, key) DO UPDATE SET value = EXCLUDED.value;

    -- Tipos de alojamiento y sus unidades.
    FOR v_tipo IN SELECT * FROM jsonb_array_elements(COALESCE(p_tipos, '[]'::JSONB))
    LOOP
        v_nombre_t := btrim(COALESCE(v_tipo->>'nombre', ''));
        CONTINUE WHEN v_nombre_t = '';

        v_cap      := GREATEST(1, LEAST(20, COALESCE((v_tipo->>'capacidad')::INT, 2)));
        v_tarifa   := GREATEST(0, COALESCE((v_tipo->>'tarifa')::NUMERIC, 0));
        -- Tope de 200 unidades por tipo: evita que un cero de mas genere miles
        -- de filas por una errata en el formulario.
        v_cantidad := GREATEST(0, LEAST(200, COALESCE((v_tipo->>'cantidad')::INT, 0)));

        v_slug := lower(btrim(v_nombre_t));
        v_slug := translate(v_slug, 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc');
        v_slug := btrim(regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g'), '-');
        IF v_slug = '' THEN v_slug := 'tipo-' || v_numero; END IF;

        INSERT INTO public.room_types (hotel_id, nombre, slug, capacidad, tarifa_dia, moneda)
        VALUES (v_hotel_id, v_nombre_t, v_slug, v_cap, v_tarifa, upper(p_moneda_base))
        ON CONFLICT (hotel_id, slug) DO UPDATE SET tarifa_dia = EXCLUDED.tarifa_dia
        RETURNING id INTO v_type_id;

        -- Unidades numeradas de forma correlativa.
        FOR v_i IN 1..v_cantidad LOOP
            v_numero := v_numero + 1;
            INSERT INTO public.rooms (hotel_id, numero, room_type_id, planta, status)
            VALUES (v_hotel_id, v_numero::TEXT, v_type_id, 1, 'disponible')
            ON CONFLICT (hotel_id, numero) DO NOTHING;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Hotel % configurado: % tipos, % unidades',
        v_hotel_id,
        (SELECT count(*) FROM public.room_types WHERE hotel_id = v_hotel_id),
        (SELECT count(*) FROM public.rooms WHERE hotel_id = v_hotel_id);

    RETURN v_hotel_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_hotel_onboarding(TEXT, TEXT, TEXT, NUMERIC, JSONB, JSONB, JSONB) FROM anon;

-- -----------------------------------------------------------------------------
-- 3. Configuracion del hotel activo, para la interfaz
-- -----------------------------------------------------------------------------
-- La aplicacion la consulta al arrancar para saber que menus enseñar y que
-- metodos de cobro ofrecer. Un solo viaje en vez de tres consultas a settings.
CREATE OR REPLACE FUNCTION public.my_hotel_config()
RETURNS TABLE (
    hotel_id    BIGINT,
    nombre      VARCHAR,
    tipo        public.tipo_alojamiento,
    moneda_base TEXT,
    iva_pct     NUMERIC,
    metodos     JSONB,
    modulos     JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT
        h.id,
        h.nombre,
        h.tipo,
        COALESCE((SELECT value #>> '{}' FROM public.settings s
                   WHERE s.hotel_id = h.id AND s.key = 'hotel.moneda_base'), 'USD'),
        COALESCE((SELECT (value #>> '{}')::NUMERIC FROM public.settings s
                   WHERE s.hotel_id = h.id AND s.key = 'hotel.iva_pct'), 16),
        COALESCE((SELECT value FROM public.settings s
                   WHERE s.hotel_id = h.id AND s.key = 'pagos.metodos'), '[]'::JSONB),
        COALESCE((SELECT value FROM public.settings s
                   WHERE s.hotel_id = h.id AND s.key = 'modulos.activos'), '[]'::JSONB)
    FROM public.hotels h
    WHERE h.id = public.current_hotel_id() AND public.is_member_of(h.id);
$$;

REVOKE EXECUTE ON FUNCTION public.my_hotel_config() FROM anon;
