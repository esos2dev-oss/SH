-- =============================================================================
-- Setup de desarrollo local. Ejecutar UNA sola vez con el usuario `postgres`:
--
--   psql -U postgres -h localhost -f scripts/setup-dev.sql
--
-- Crea el usuario sh_user, la base sh_db y le da permisos. Despues:
--   npm run migrate
--   npm run seed
-- =============================================================================

-- Crear el rol si no existe (Postgres no tiene IF NOT EXISTS para CREATE USER)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'sh_user') THEN
    CREATE USER sh_user WITH PASSWORD 'sh_pass';
  END IF;
END
$$;

-- Crear la base. Si ya existe, no falla por el DO block previo arriba.
SELECT 'CREATE DATABASE sh_db OWNER sh_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'sh_db')\gexec

-- Permisos
GRANT ALL PRIVILEGES ON DATABASE sh_db TO sh_user;
ALTER DATABASE sh_db OWNER TO sh_user;

\c sh_db
GRANT ALL ON SCHEMA public TO sh_user;
ALTER SCHEMA public OWNER TO sh_user;
