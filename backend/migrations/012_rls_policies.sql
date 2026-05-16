-- =============================================================================
-- 012 — Row Level Security
-- =============================================================================
-- IMPORTANTE: el backend setea variables de sesion al inicio de cada request via
-- middleware/rls.ts (helper withRlsClient).
-- Variables: app.current_user_id, app.current_user_role
--
-- Para MVP las politicas son permisivas para no bloquear desarrollo en Fase 03.
-- En Fase 03/04 se afinan por rol y se agregan politicas estrictas en customers,
-- bookings, ledger_entries.

-- Helpers para leer las variables
CREATE OR REPLACE FUNCTION current_user_role() RETURNS TEXT AS $$
BEGIN
    RETURN current_setting('app.current_user_role', true);
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION current_user_id() RETURNS BIGINT AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::BIGINT;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- USERS
-- superadmin: todo. Resto: solo su propia fila.
-- =============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_users_select ON users;
CREATE POLICY p_users_select ON users
    FOR SELECT
    USING (
        current_user_role() = 'superadmin'
        OR current_user_role() = 'admin'
        OR id = current_user_id()
    );

DROP POLICY IF EXISTS p_users_insert ON users;
CREATE POLICY p_users_insert ON users
    FOR INSERT
    WITH CHECK (current_user_role() = 'superadmin');

DROP POLICY IF EXISTS p_users_update ON users;
CREATE POLICY p_users_update ON users
    FOR UPDATE
    USING (current_user_role() = 'superadmin' OR id = current_user_id());

DROP POLICY IF EXISTS p_users_delete ON users;
CREATE POLICY p_users_delete ON users
    FOR DELETE
    USING (current_user_role() = 'superadmin');

-- =============================================================================
-- AUDIT LOG
-- Solo admin/superadmin leen. Insert es libre (lo escriben los services).
-- =============================================================================
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_audit_select ON audit_log;
CREATE POLICY p_audit_select ON audit_log
    FOR SELECT
    USING (current_user_role() IN ('superadmin', 'admin'));

DROP POLICY IF EXISTS p_audit_insert ON audit_log;
CREATE POLICY p_audit_insert ON audit_log
    FOR INSERT
    WITH CHECK (true);

-- =============================================================================
-- BYPASS para roles de aplicacion
-- En desarrollo, el usuario que conecta a Postgres es probablemente owner de la
-- tabla — y los owners IGNORAN RLS. En produccion el usuario de aplicacion debe
-- ser distinto al owner. Si fuera necesario:
--   ALTER TABLE users FORCE ROW LEVEL SECURITY;
-- Por ahora dejamos sin FORCE para no romper migrate/seed con superuser local.
-- =============================================================================

-- Politicas adicionales (rooms, customers, bookings, ledger) se añaden en
-- migraciones siguientes (013_rls_*) durante Fase 03 cuando los modulos existan.
