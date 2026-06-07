-- =============================================================================
-- Extensiones y tipos ENUM
-- =============================================================================
-- Migracion consolidada para Supabase. Reemplaza 001_extensions + 002_enums + 013
-- payment_method extensions del schema Express previo. Marketing (promotions,
-- email, whatsapp) intencionalmente excluido (drop en 016 del schema legacy).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Generador de codigos legibles (BK-2026-0001, LG-2026-0001, PM-..., CC-...)
CREATE TABLE IF NOT EXISTS public.code_sequences (
    prefix   VARCHAR(10)  NOT NULL,
    year     INTEGER      NOT NULL,
    counter  INTEGER      NOT NULL DEFAULT 0,
    PRIMARY KEY (prefix, year)
);

-- =============================================================================
-- ENUMs de dominio
-- =============================================================================
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('superadmin', 'admin', 'recepcion', 'limpieza', 'contabilidad');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.room_status AS ENUM ('disponible', 'ocupada', 'limpieza', 'mantenimiento', 'fuera_servicio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.booking_period AS ENUM ('dia', 'semana', 'mes');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.booking_status AS ENUM ('pendiente', 'confirmada', 'en_curso', 'finalizada', 'cancelada', 'no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.payment_method AS ENUM (
        'efectivo', 'tarjeta', 'transferencia', 'paypal', 'otro',
        'pago_movil', 'zelle', 'punto_venta', 'efectivo_usd', 'efectivo_bs'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.payment_status AS ENUM ('pendiente', 'parcial', 'pagado', 'reembolsado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.payment_confirmation_status AS ENUM ('pending_confirmation', 'confirmed', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.ledger_type AS ENUM ('ingreso', 'egreso');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.ledger_status AS ENUM ('registrado', 'conciliado', 'anulado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.receipt_kind AS ENUM ('imagen', 'pdf');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.doc_kind AS ENUM ('dni', 'pasaporte', 'cedula', 'licencia', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.audit_action AS ENUM (
        'create', 'update', 'delete', 'login', 'logout',
        'status_change', 'permission_change', 'export'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
