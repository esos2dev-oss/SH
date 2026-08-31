-- =============================================================================
-- SaaS · Alta autonoma de hoteles e invitaciones
-- =============================================================================
-- Sin esto, dar de alta a un cliente es trabajo manual del equipo y el producto
-- no escala: cada venta requeriria a alguien creando filas a mano.
--
-- Cubre:
--   1. create_hotel_with_owner() — un usuario recien registrado crea su hotel
--   2. Datos minimos para empezar (categorias contables y ajustes)
--   3. Invitaciones a miembros del equipo
--   4. switch_hotel() — cambiar de hotel activo validando pertenencia

-- -----------------------------------------------------------------------------
-- 1. Crear hotel
-- -----------------------------------------------------------------------------
-- Quien la llama queda como owner. Devuelve el id del hotel creado.
--
-- SECURITY DEFINER porque tiene que insertar en hotels, y la policy de hotels
-- solo deja ver los propios: sin esto ningun usuario podria crear el primero.
-- El control es que solo actua sobre auth.uid(), nunca sobre otro usuario.
CREATE OR REPLACE FUNCTION public.create_hotel_with_owner(
    p_nombre       TEXT,
    p_moneda_base  TEXT DEFAULT 'USD',
    p_iva_pct      NUMERIC DEFAULT 16
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid      UUID := auth.uid();
    v_hotel_id BIGINT;
    v_slug     TEXT;
    v_intento  INT := 0;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Hay que iniciar sesion para crear un hotel'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_nombre IS NULL OR length(btrim(p_nombre)) < 2 THEN
        RAISE EXCEPTION 'El nombre del hotel es obligatorio'
            USING ERRCODE = 'check_violation';
    END IF;

    IF upper(p_moneda_base) NOT IN ('USD', 'EUR', 'VES') THEN
        RAISE EXCEPTION 'Moneda base no soportada: %', p_moneda_base
            USING ERRCODE = 'check_violation';
    END IF;

    -- Limite anti-abuso: una cuenta no puede crear hoteles sin fin, que seria
    -- la forma obvia de encadenar pruebas gratuitas indefinidamente.
    IF (SELECT count(*) FROM public.hotel_members
         WHERE user_id = v_uid AND role = 'owner') >= 10 THEN
        RAISE EXCEPTION 'Has alcanzado el maximo de hoteles por cuenta'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Slug legible y unico. Se resuelven los acentos con translate() en vez de
    -- unaccent() para no depender de que la extension este instalada: esta
    -- funcion tiene que correr en cualquier despliegue nuevo, sin preparativos.
    v_slug := lower(btrim(p_nombre));
    v_slug := translate(v_slug, 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc');
    v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
    v_slug := btrim(regexp_replace(v_slug, '-+', '-', 'g'), '-');
    IF v_slug = '' THEN v_slug := 'hotel'; END IF;

    WHILE EXISTS (SELECT 1 FROM public.hotels WHERE slug = v_slug) LOOP
        v_intento := v_intento + 1;
        v_slug := regexp_replace(v_slug, '-[0-9]+$', '') || '-' || v_intento;
    END LOOP;

    INSERT INTO public.hotels (nombre, slug, plan, subscription_status, trial_ends_at)
    VALUES (btrim(p_nombre), v_slug, 'esencial', 'trialing', now() + INTERVAL '30 days')
    RETURNING id INTO v_hotel_id;

    INSERT INTO public.hotel_members (hotel_id, user_id, role)
    VALUES (v_hotel_id, v_uid, 'owner');

    -- Ajustes minimos para que el hotel pueda operar desde el primer minuto.
    INSERT INTO public.settings (hotel_id, key, value) VALUES
        (v_hotel_id, 'hotel.nombre',      to_jsonb(btrim(p_nombre))),
        (v_hotel_id, 'hotel.moneda_base', to_jsonb(upper(p_moneda_base))),
        (v_hotel_id, 'hotel.iva_pct',     to_jsonb(p_iva_pct))
    ON CONFLICT DO NOTHING;

    -- Categorias contables basicas: sin ellas no se puede registrar el primer
    -- ingreso ni el primer gasto, y el hotel se topa con un muro en el dia uno.
    INSERT INTO public.ledger_categories (hotel_id, nombre, slug, type)
    VALUES
        (v_hotel_id, 'Alojamiento',    'alojamiento-'    || v_hotel_id, 'ingreso'),
        (v_hotel_id, 'Otros ingresos', 'otros-ingresos-' || v_hotel_id, 'ingreso'),
        (v_hotel_id, 'Suministros',    'suministros-'    || v_hotel_id, 'egreso'),
        (v_hotel_id, 'Servicios',      'servicios-'      || v_hotel_id, 'egreso'),
        (v_hotel_id, 'Personal',       'personal-'       || v_hotel_id, 'egreso'),
        (v_hotel_id, 'Mantenimiento',  'mantenimiento-'  || v_hotel_id, 'egreso')
    ON CONFLICT DO NOTHING;

    RETURN v_hotel_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_hotel_with_owner(TEXT, TEXT, NUMERIC) FROM anon;

-- -----------------------------------------------------------------------------
-- 2. Cambiar de hotel activo
-- -----------------------------------------------------------------------------
-- Valida la pertenencia antes de fijar nada: si no, cambiar de hotel seria
-- "declara el id que quieras". Devuelve el hotel realmente activado.
CREATE OR REPLACE FUNCTION public.switch_hotel(p_hotel_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF NOT public.is_member_of(p_hotel_id) THEN
        RAISE EXCEPTION 'No perteneces a ese hotel'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    PERFORM set_config('app.hotel_id', p_hotel_id::TEXT, false);
    RETURN p_hotel_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.switch_hotel(BIGINT) FROM anon;

-- -----------------------------------------------------------------------------
-- 3. Hoteles del usuario (para el selector)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_hotels()
RETURNS TABLE (
    hotel_id   BIGINT,
    nombre     VARCHAR,
    slug       VARCHAR,
    role       public.hotel_role,
    plan       public.plan_code,
    status     public.subscription_status,
    access     TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT h.id, h.nombre, h.slug, m.role, h.plan, h.subscription_status,
           public.hotel_access_level(h.id)
    FROM public.hotels h
    JOIN public.hotel_members m ON m.hotel_id = h.id
    WHERE m.user_id = auth.uid() AND h.active
    ORDER BY h.nombre;
$$;

REVOKE EXECUTE ON FUNCTION public.my_hotels() FROM anon;

-- -----------------------------------------------------------------------------
-- 4. Invitaciones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hotel_invitations (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hotel_id   BIGINT NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    email      VARCHAR(255) NOT NULL,
    role       public.hotel_role NOT NULL DEFAULT 'recepcion',
    token      UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (hotel_id, email)
);

CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.hotel_invitations (lower(email));

ALTER TABLE public.hotel_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_invitations_select ON public.hotel_invitations;
CREATE POLICY p_invitations_select ON public.hotel_invitations
    FOR SELECT TO authenticated
    USING (public.is_member_of(hotel_id));

-- Invitar, cambiar rol o revocar: owner y admin DE ESE hotel.
-- Se apoya en is_member_of() igual que el resto del sistema, en vez de repetir
-- la subconsulta a mano: una policy que reimplementa el aislamiento por su
-- cuenta es una policy que puede divergir del resto sin que nadie lo note.
DROP POLICY IF EXISTS p_invitations_write ON public.hotel_invitations;
CREATE POLICY p_invitations_write ON public.hotel_invitations
    FOR ALL TO authenticated
    USING (
        public.is_member_of(hotel_id)
        AND EXISTS (SELECT 1 FROM public.hotel_members m
                     WHERE m.hotel_id = hotel_invitations.hotel_id
                       AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
    )
    WITH CHECK (
        public.is_member_of(hotel_id)
        AND EXISTS (SELECT 1 FROM public.hotel_members m
                     WHERE m.hotel_id = hotel_invitations.hotel_id
                       AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
    );

-- Aceptar una invitacion: da de alta al usuario actual como miembro.
-- El token es la credencial, por eso se busca por token y no por hotel_id.
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_inv public.hotel_invitations%ROWTYPE;
    v_email TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Hay que iniciar sesion para aceptar la invitacion'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_inv FROM public.hotel_invitations WHERE token = p_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitacion no valida' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_inv.accepted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Esa invitacion ya se uso' USING ERRCODE = 'check_violation';
    END IF;
    IF v_inv.expires_at < now() THEN
        RAISE EXCEPTION 'La invitacion ha caducado' USING ERRCODE = 'check_violation';
    END IF;

    -- La invitacion es para un email concreto: sin esta comprobacion, cualquiera
    -- con el enlace entraria en el hotel.
    SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
    IF lower(v_email) <> lower(v_inv.email) THEN
        RAISE EXCEPTION 'Esta invitacion es para otra direccion de correo'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO public.hotel_members (hotel_id, user_id, role, invited_by)
    VALUES (v_inv.hotel_id, v_uid, v_inv.role, v_inv.invited_by)
    ON CONFLICT (hotel_id, user_id) DO UPDATE SET role = EXCLUDED.role;

    UPDATE public.hotel_invitations SET accepted_at = now() WHERE id = v_inv.id;

    RETURN v_inv.hotel_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_invitation(UUID) FROM anon;
