-- =============================================================================
-- Auditoria real + registro de ultimo acceso
-- =============================================================================
-- Problema que resuelve (bug 8):
--   a) El log mostraba "— sin usuario —" en todo. El user_id SI se guardaba;
--      la API del frontend devolvia user_nombre: null hardcodeado porque nunca
--      se hacia el join con profiles. Aqui creamos la vista que lo resuelve.
--   b) Solo habia 5 registros, todos status_change: unicamente las edge
--      functions de check-in/check-out escribian en audit_log. Crear huesped,
--      crear reserva, cobrar, cambiar la tasa o tocar settings no dejaban rastro.
--      Aqui añadimos un trigger generico sobre las tablas sensibles.
--   c) profiles.last_login_at nunca se escribia (la migracion original lo dejo
--      como "pendiente"). Aqui va la RPC que lo actualiza.
--
-- Idempotente.

-- =============================================================================
-- 1. Trigger generico de auditoria
-- =============================================================================
-- Notas de diseño:
--  - SECURITY DEFINER para poder insertar aunque el rol del usuario no tenga
--    permiso directo sobre audit_log.
--  - Nunca debe hacer fallar la operacion auditada: si el insert de auditoria
--    revienta, lo degradamos a WARNING.
--  - Se excluyen columnas ruidosas (updated_at) para que el diff sea legible.
CREATE OR REPLACE FUNCTION public.tg_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_action   public.audit_action;
    v_before   JSONB;
    v_after    JSONB;
    v_entity_id TEXT;
    v_noise    TEXT[] := ARRAY['updated_at'];
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'create';
        v_after  := to_jsonb(NEW) - v_noise;
        v_entity_id := (to_jsonb(NEW) ->> 'id');
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete';
        v_before := to_jsonb(OLD) - v_noise;
        v_entity_id := (to_jsonb(OLD) ->> 'id');
    ELSE
        v_before := to_jsonb(OLD) - v_noise;
        v_after  := to_jsonb(NEW) - v_noise;
        v_entity_id := (to_jsonb(NEW) ->> 'id');

        -- Sin cambios reales: no ensuciamos el log.
        IF v_before = v_after THEN
            RETURN NEW;
        END IF;

        IF TG_TABLE_NAME = 'profiles' AND (v_before ->> 'role') IS DISTINCT FROM (v_after ->> 'role') THEN
            v_action := 'permission_change';
        ELSIF (v_before ->> 'status') IS DISTINCT FROM (v_after ->> 'status') THEN
            v_action := 'status_change';
        ELSE
            v_action := 'update';
        END IF;
    END IF;

    BEGIN
        INSERT INTO public.audit_log (user_id, action, entity, entity_id, before, after)
        VALUES (auth.uid(), v_action, TG_TABLE_NAME, v_entity_id, v_before, v_after);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'audit_log fallo para %.% (%): %', TG_TABLE_NAME, v_entity_id, v_action, SQLERRM;
    END;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

-- =============================================================================
-- 2. Enganchar el trigger a las tablas sensibles
-- =============================================================================
DO $$
DECLARE
    t TEXT;
    audited TEXT[] := ARRAY[
        'bookings', 'customers', 'booking_payments', 'rooms',
        'room_types', 'ledger_entries', 'exchange_rates', 'settings',
        'profiles', 'cash_closures', 'check_ins'
    ];
BEGIN
    FOREACH t IN ARRAY audited LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS tg_audit_%1$s ON public.%1$I', t);
            EXECUTE format(
                'CREATE TRIGGER tg_audit_%1$s
                   AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
                   FOR EACH ROW EXECUTE FUNCTION public.tg_audit()', t);
        END IF;
    END LOOP;
END $$;

-- =============================================================================
-- 3. Vista de auditoria con nombre de usuario
-- =============================================================================
-- security_invoker = true para que siga aplicando la RLS de audit_log
-- (solo admin/superadmin leen). Sin esto la vista correria como owner y
-- cualquier autenticado veria el log completo.
DROP VIEW IF EXISTS public.audit_log_with_user;
CREATE VIEW public.audit_log_with_user
WITH (security_invoker = true) AS
SELECT
    a.id, a.user_id, a.action, a.entity, a.entity_id,
    a.before, a.after, a.ip, a.user_agent, a.created_at,
    p.nombre AS user_nombre,
    p.email  AS user_email,
    p.role   AS user_role
FROM public.audit_log a
LEFT JOIN public.profiles p ON p.id = a.user_id;

GRANT SELECT ON public.audit_log_with_user TO authenticated;

-- =============================================================================
-- 4. Ultimo acceso
-- =============================================================================
CREATE OR REPLACE FUNCTION public.touch_last_login()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RETURN; END IF;

    UPDATE public.profiles
       SET last_login_at = NOW()
     WHERE id = auth.uid();

    BEGIN
        INSERT INTO public.audit_log (user_id, action, entity, entity_id)
        VALUES (auth.uid(), 'login', 'profiles', auth.uid()::text);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_last_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;

-- Backfill: los usuarios que ya tienen sesion creada en auth.users heredan su
-- ultimo sign-in conocido, para que la columna no arranque toda vacia.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'auth' AND table_name = 'users'
                 AND column_name = 'last_sign_in_at') THEN
        UPDATE public.profiles p
           SET last_login_at = u.last_sign_in_at
          FROM auth.users u
         WHERE u.id = p.id
           AND p.last_login_at IS NULL
           AND u.last_sign_in_at IS NOT NULL;
    END IF;
END $$;
