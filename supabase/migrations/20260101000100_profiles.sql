-- =============================================================================
-- Profiles — extiende auth.users de Supabase con datos de aplicacion (rol, etc.)
-- =============================================================================
-- En lugar de tabla `users` propia, Supabase maneja credenciales en auth.users.
-- profiles.id = auth.users.id (UUID). 1:1 con cascade.

CREATE TABLE IF NOT EXISTS public.profiles (
    id              UUID            PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre          VARCHAR(200)    NOT NULL,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    role            public.user_role NOT NULL DEFAULT 'recepcion',
    active          BOOLEAN         NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (LOWER(email)) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_role  ON public.profiles (role) WHERE active = true;

-- Trigger: cuando se crea un auth.users, crear profile vacio (nombre se completa luego)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, nombre, email, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
        NEW.email,
        COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'recepcion')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Sync de last_login: lo hace una edge function o trigger sobre auth.sessions si se requiere.

-- =============================================================================
-- Helpers: rol del usuario actual desde JWT/profiles
-- =============================================================================
-- Estrategia: leer rol desde profiles (fuente de verdad), no del JWT, para que un
-- cambio de rol tenga efecto inmediato sin esperar a refresh del token.
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() AND active = true;
$$;

CREATE OR REPLACE FUNCTION public.has_role(VARIADIC roles public.user_role[])
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND active = true AND role = ANY(roles)
    );
$$;
