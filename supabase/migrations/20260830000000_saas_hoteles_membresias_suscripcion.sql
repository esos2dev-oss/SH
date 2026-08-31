-- =============================================================================
-- SaaS · Hoteles, membresias N:N, suscripcion y retencion de datos
-- =============================================================================
-- Primera fase de la conversion a producto multi-cliente. Introduce el concepto
-- de "hotel" (el cliente que paga) y la pertenencia muchos-a-muchos entre
-- usuarios y hoteles.
--
-- ALCANCE DE ESTA MIGRACION:
--   - Crea hotels, hotel_members, y los helpers de pertenencia/rol/acceso.
--   - NO añade todavia hotel_id a las 22 tablas de negocio ni reescribe sus
--     policies. Eso es la fase siguiente, y es la mas delicada del proyecto:
--     hasta que se haga, los datos de negocio SIGUEN SIN AISLAR entre hoteles.
--     Ver docs/06-producto-saas.md, seccion 2.1.
--
-- POR QUE EN DOS FASES: reescribir de golpe todas las RLS junto con el modelo de
-- suscripcion mezcla dos cambios de riesgo distinto. Esta fase se puede probar y
-- revertir sola; la siguiente toca cada tabla del sistema.

-- -----------------------------------------------------------------------------
-- 1. Tipos
-- -----------------------------------------------------------------------------

-- Rol DENTRO de un hotel. Es distinto de public.user_role, que es global por
-- persona: con pertenencia N:N la misma persona puede ser owner en un hotel y
-- recepcion en otro, asi que el rol vive en la relacion, no en el perfil.
-- 'owner' es nuevo: manda en el hotel y es quien responde de la suscripcion.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hotel_role') THEN
        CREATE TYPE public.hotel_role AS ENUM (
            'owner', 'admin', 'recepcion', 'limpieza', 'contabilidad', 'restaurante'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_code') THEN
        CREATE TYPE public.plan_code AS ENUM ('esencial', 'profesional', 'grupo');
    END IF;
END $$;

-- Estados alineados con los de Stripe para que el webhook sea un mapeo directo
-- y no haya que interpretar nada.
--   trialing  -> mes de prueba, acceso completo
--   active    -> suscripcion al corriente
--   past_due  -> el cobro fallo; Stripe reintenta. Todavia acceso completo.
--   canceled  -> baja voluntaria o reintentos agotados -> solo lectura
--   expired   -> se acabo tambien el periodo de solo lectura -> sin acceso
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
        CREATE TYPE public.subscription_status AS ENUM (
            'trialing', 'active', 'past_due', 'canceled', 'expired'
        );
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. hotels — el cliente que paga
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hotels (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre               VARCHAR(200) NOT NULL CHECK (length(btrim(nombre)) > 0),
    slug                 VARCHAR(80)  NOT NULL UNIQUE,

    plan                 public.plan_code           NOT NULL DEFAULT 'esencial',
    subscription_status  public.subscription_status NOT NULL DEFAULT 'trialing',

    -- Prueba de 30 dias desde el alta, sin tarjeta y sin funciones recortadas.
    trial_ends_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),

    -- Fin del periodo pagado en curso. Lo mantiene el webhook de Stripe.
    current_period_end   TIMESTAMPTZ,

    -- Ventana de SOLO LECTURA tras quedarse sin suscripcion: puede consultar y
    -- exportar, no crear. Presiona a pagar sin destruir nada.
    grace_until          TIMESTAMPTZ,

    -- Hasta cuando se conservan los datos. Pasada esta fecha son eliminables.
    -- NUNCA se borra automaticamente sin avisar antes por email.
    data_retention_until TIMESTAMPTZ,

    stripe_customer_id     TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,

    active     BOOLEAN     NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.hotels IS 'Cliente del SaaS. Cada hotel es un tenant con su propia suscripcion.';
COMMENT ON COLUMN public.hotels.grace_until IS 'Fin del periodo de solo lectura tras perder la suscripcion.';
COMMENT ON COLUMN public.hotels.data_retention_until IS 'Fecha a partir de la cual los datos son eliminables. Avisar por email antes.';

CREATE INDEX IF NOT EXISTS idx_hotels_status ON public.hotels (subscription_status) WHERE active;
CREATE INDEX IF NOT EXISTS idx_hotels_stripe_customer ON public.hotels (stripe_customer_id);

-- -----------------------------------------------------------------------------
-- 3. hotel_members — la relacion N:N, donde vive el rol
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hotel_members (
    hotel_id   BIGINT           NOT NULL REFERENCES public.hotels(id)   ON DELETE CASCADE,
    user_id    UUID             NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role       public.hotel_role NOT NULL DEFAULT 'recepcion',
    invited_by UUID             REFERENCES public.profiles(id) ON DELETE SET NULL,
    joined_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
    PRIMARY KEY (hotel_id, user_id)
);

COMMENT ON TABLE public.hotel_members IS 'Pertenencia N:N usuario-hotel. El rol es por hotel, no global.';

CREATE INDEX IF NOT EXISTS idx_hotel_members_user ON public.hotel_members (user_id);

-- Un hotel no puede quedarse sin ningun owner: seria un hotel huerfano, sin
-- nadie que pueda pagar la suscripcion ni invitar a nadie mas.
CREATE OR REPLACE FUNCTION public.tg_hotel_members_keep_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_hotel_id BIGINT := COALESCE(OLD.hotel_id, NEW.hotel_id);
    v_owners   INT;
BEGIN
    -- Si el hotel entero se esta borrando, el cascade se encarga; no estorbamos.
    IF NOT EXISTS (SELECT 1 FROM public.hotels WHERE id = v_hotel_id) THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT count(*) INTO v_owners
    FROM public.hotel_members
    WHERE hotel_id = v_hotel_id AND role = 'owner';

    IF v_owners = 0 THEN
        RAISE EXCEPTION 'El hotel % se quedaria sin ningun owner', v_hotel_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_hotel_members_keep_owner ON public.hotel_members;
CREATE CONSTRAINT TRIGGER trg_hotel_members_keep_owner
    AFTER UPDATE OR DELETE ON public.hotel_members
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.tg_hotel_members_keep_owner();

DROP TRIGGER IF EXISTS trg_hotels_updated_at ON public.hotels;
CREATE TRIGGER trg_hotels_updated_at
    BEFORE UPDATE ON public.hotels
    FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Helpers de pertenencia y rol
-- -----------------------------------------------------------------------------

-- Hoteles a los que pertenece quien llama. Base de todas las policies futuras.
CREATE OR REPLACE FUNCTION public.my_hotel_ids()
RETURNS SETOF BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT hotel_id FROM public.hotel_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_member_of(p_hotel_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.hotel_members
        WHERE hotel_id = p_hotel_id AND user_id = auth.uid()
    );
$$;

-- Hotel activo de la sesion. El cliente lo fija con set_config('app.hotel_id',...)
-- al entrar y al cambiar de hotel.
--
-- CRITICO: no basta con leer lo que manda el cliente. Si el usuario no pertenece
-- al hotel que declara, devolvemos NULL — de lo contrario cambiar de hotel seria
-- "escribe el id que quieras y entra". Cuando pertenece a uno solo, se resuelve
-- sin que el cliente tenga que declarar nada.
CREATE OR REPLACE FUNCTION public.current_hotel_id()
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_declared TEXT   := current_setting('app.hotel_id', true);
    v_hotel_id BIGINT;
BEGIN
    IF v_declared IS NOT NULL AND v_declared <> '' THEN
        BEGIN
            v_hotel_id := v_declared::BIGINT;
        EXCEPTION WHEN invalid_text_representation THEN
            RETURN NULL;
        END;

        IF public.is_member_of(v_hotel_id) THEN
            RETURN v_hotel_id;
        END IF;
        RETURN NULL;
    END IF;

    -- Sin hotel declarado: si solo pertenece a uno, es ese.
    SELECT hotel_id INTO v_hotel_id
    FROM public.hotel_members
    WHERE user_id = auth.uid()
    LIMIT 2;

    IF (SELECT count(*) FROM public.hotel_members WHERE user_id = auth.uid()) = 1 THEN
        RETURN v_hotel_id;
    END IF;

    RETURN NULL;
END;
$$;

-- Equivalente de has_role() pero acotado al hotel activo.
CREATE OR REPLACE FUNCTION public.has_role_in_hotel(VARIADIC roles public.hotel_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.hotel_members
        WHERE user_id  = auth.uid()
          AND hotel_id = public.current_hotel_id()
          AND role     = ANY(roles)
    );
$$;

-- -----------------------------------------------------------------------------
-- 5. Estado de acceso segun la suscripcion
-- -----------------------------------------------------------------------------
-- Devuelve 'full', 'read_only' o 'blocked'. La regla de negocio de la
-- monetizacion vive AQUI, en la base de datos, no en el frontend: un limite que
-- solo existe en React se salta llamando a la API.
CREATE OR REPLACE FUNCTION public.hotel_access_level(p_hotel_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    h public.hotels%ROWTYPE;
BEGIN
    SELECT * INTO h FROM public.hotels WHERE id = p_hotel_id;
    IF NOT FOUND OR NOT h.active THEN
        RETURN 'blocked';
    END IF;

    -- Al corriente, o el cobro fallo pero Stripe sigue reintentando: no se corta
    -- el servicio a un hotel por un problema temporal con su tarjeta.
    IF h.subscription_status IN ('active', 'past_due') THEN
        RETURN 'full';
    END IF;

    -- Prueba viva.
    IF h.subscription_status = 'trialing' AND h.trial_ends_at > now() THEN
        RETURN 'full';
    END IF;

    -- Prueba agotada o baja: ventana de solo lectura. Puede consultar y exportar.
    IF h.grace_until IS NOT NULL AND h.grace_until > now() THEN
        RETURN 'read_only';
    END IF;

    RETURN 'blocked';
END;
$$;

-- Resumen para la interfaz: que mostrar en el aviso de suscripcion.
CREATE OR REPLACE FUNCTION public.my_hotel_subscription(p_hotel_id BIGINT DEFAULT NULL)
RETURNS TABLE (
    hotel_id             BIGINT,
    nombre               VARCHAR,
    plan                 public.plan_code,
    status               public.subscription_status,
    access_level         TEXT,
    trial_ends_at        TIMESTAMPTZ,
    days_left            INT,
    grace_until          TIMESTAMPTZ,
    data_retention_until TIMESTAMPTZ,
    is_owner             BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT
        h.id,
        h.nombre,
        h.plan,
        h.subscription_status,
        public.hotel_access_level(h.id),
        h.trial_ends_at,
        GREATEST(0, EXTRACT(DAY FROM (
            COALESCE(h.current_period_end, h.trial_ends_at) - now()
        ))::INT),
        h.grace_until,
        h.data_retention_until,
        EXISTS (
            SELECT 1 FROM public.hotel_members m
            WHERE m.hotel_id = h.id AND m.user_id = auth.uid() AND m.role = 'owner'
        )
    FROM public.hotels h
    WHERE h.id = COALESCE(p_hotel_id, public.current_hotel_id())
      AND public.is_member_of(h.id);
$$;

-- -----------------------------------------------------------------------------
-- 6. Cierre de la prueba
-- -----------------------------------------------------------------------------
-- Pasa a solo lectura los hoteles cuya prueba o suscripcion ha vencido, y fija
-- las fechas de gracia y de retencion.
--
-- Politica por defecto: 30 dias de solo lectura + 90 dias mas de conservacion
-- antes de que los datos sean eliminables. Total: 120 dias desde el vencimiento.
-- Nunca se borra nada automaticamente aqui; solo se marca la fecha.
CREATE OR REPLACE FUNCTION public.expire_finished_trials(
    p_grace_days     INT DEFAULT 30,
    p_retention_days INT DEFAULT 90
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_count INT;
BEGIN
    WITH vencidos AS (
        UPDATE public.hotels
           SET subscription_status  = 'canceled',
               grace_until          = now() + make_interval(days => p_grace_days),
               data_retention_until = now() + make_interval(days => p_grace_days + p_retention_days),
               updated_at           = now()
         WHERE active
           AND subscription_status = 'trialing'
           AND trial_ends_at <= now()
        RETURNING 1
    )
    SELECT count(*) INTO v_count FROM vencidos;

    -- Agotada tambien la ventana de solo lectura: sin acceso, datos aun a salvo.
    UPDATE public.hotels
       SET subscription_status = 'expired',
           updated_at          = now()
     WHERE active
       AND subscription_status = 'canceled'
       AND grace_until IS NOT NULL
       AND grace_until <= now();

    RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.hotels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_members ENABLE ROW LEVEL SECURITY;

-- Cada quien ve unicamente los hoteles a los que pertenece.
DROP POLICY IF EXISTS p_hotels_select ON public.hotels;
CREATE POLICY p_hotels_select ON public.hotels
    FOR SELECT TO authenticated
    USING (public.is_member_of(id));

-- Solo el owner edita su hotel. Y nunca desde el cliente: las columnas de
-- suscripcion las escribe el webhook de Stripe con service_role, que se salta
-- RLS. Si el frontend pudiera tocarlas, cualquiera se regalaria una suscripcion.
DROP POLICY IF EXISTS p_hotels_update ON public.hotels;
CREATE POLICY p_hotels_update ON public.hotels
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.hotel_members m
            WHERE m.hotel_id = hotels.id AND m.user_id = auth.uid() AND m.role = 'owner'
        )
    );

DROP POLICY IF EXISTS p_hotel_members_select ON public.hotel_members;
CREATE POLICY p_hotel_members_select ON public.hotel_members
    FOR SELECT TO authenticated
    USING (public.is_member_of(hotel_id));

-- Invitar, cambiar el rol de alguien o expulsarlo: owner y admin del hotel.
DROP POLICY IF EXISTS p_hotel_members_write ON public.hotel_members;
CREATE POLICY p_hotel_members_write ON public.hotel_members
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.hotel_members m
            WHERE m.hotel_id = hotel_members.hotel_id
              AND m.user_id  = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

-- -----------------------------------------------------------------------------
-- 8. Permisos
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.tg_hotel_members_keep_owner()          FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.expire_finished_trials(INT, INT)       FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.hotel_access_level(BIGINT)             FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_hotel_subscription(BIGINT)          FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_hotel_id()                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_member_of(BIGINT)                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_hotel_ids()                         FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role_in_hotel(VARIADIC public.hotel_role[]) FROM anon;

-- -----------------------------------------------------------------------------
-- 9. Alta del hotel existente
-- -----------------------------------------------------------------------------
-- Los datos actuales pertenecen a un hotel real. Se le crea su fila y se le da
-- de alta como miembros a todos los perfiles existentes, conservando su rol.
DO $$
DECLARE
    v_hotel_id BIGINT;
BEGIN
    IF EXISTS (SELECT 1 FROM public.hotels) THEN
        RETURN;
    END IF;

    -- Se crea SIEMPRE, tambien en instalacion limpia. Las migraciones
    -- anteriores dejan filas en settings y otras tablas sin hotel al que
    -- asignarlas, y sin un hotel destino el relleno de hotel_id no puede
    -- completarse (la clave primaria de settings lo exige).
    -- El seed reutiliza este hotel en vez de crear otro.

    INSERT INTO public.hotels (nombre, slug, plan, subscription_status, trial_ends_at)
    VALUES (
        COALESCE(NULLIF((SELECT value #>> '{}' FROM public.settings WHERE key = 'hotel.nombre'), 'TODO — completar'), 'Mi hotel'),
        'hotel-principal',
        'profesional',
        'active',
        now() + INTERVAL '30 days'
    )
    RETURNING id INTO v_hotel_id;

    INSERT INTO public.hotel_members (hotel_id, user_id, role)
    SELECT v_hotel_id, p.id,
           CASE p.role
               WHEN 'superadmin'   THEN 'owner'::public.hotel_role
               WHEN 'admin'        THEN 'admin'::public.hotel_role
               WHEN 'recepcion'    THEN 'recepcion'::public.hotel_role
               WHEN 'limpieza'     THEN 'limpieza'::public.hotel_role
               WHEN 'contabilidad' THEN 'contabilidad'::public.hotel_role
               ELSE 'recepcion'::public.hotel_role
           END
    FROM public.profiles p
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Hotel inicial creado (id %) con % miembros', v_hotel_id,
        (SELECT count(*) FROM public.hotel_members WHERE hotel_id = v_hotel_id);
END $$;
