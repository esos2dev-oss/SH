-- =============================================================================
-- 001 — Extensiones requeridas
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Tabla de control de migraciones aplicadas (la usa el script migrate.ts)
CREATE TABLE IF NOT EXISTS _migrations (
    id          SERIAL       PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Tabla de generador de codigos legibles (BK-2026-0001, LG-2026-0001)
CREATE TABLE IF NOT EXISTS code_sequences (
    prefix   VARCHAR(10)  NOT NULL,
    year     INTEGER      NOT NULL,
    counter  INTEGER      NOT NULL DEFAULT 0,
    PRIMARY KEY (prefix, year)
);
