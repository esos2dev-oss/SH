-- =============================================================================
-- 002 — Tipos ENUM
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'recepcion', 'limpieza', 'contabilidad');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE room_status AS ENUM ('disponible', 'ocupada', 'limpieza', 'mantenimiento', 'fuera_servicio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE booking_period AS ENUM ('dia', 'semana', 'mes');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE booking_status AS ENUM ('pendiente', 'confirmada', 'en_curso', 'finalizada', 'cancelada', 'no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('efectivo', 'tarjeta', 'transferencia', 'paypal', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pendiente', 'parcial', 'pagado', 'reembolsado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ledger_type AS ENUM ('ingreso', 'egreso');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ledger_status AS ENUM ('registrado', 'conciliado', 'anulado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE receipt_kind AS ENUM ('imagen', 'pdf');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE promotion_kind AS ENUM ('porcentaje', 'monto_fijo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE email_event AS ENUM ('bienvenida', 'post_estancia', 'fecha_especial', 'recuperacion', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE email_status AS ENUM ('pendiente', 'enviado', 'entregado', 'abierto', 'fallido', 'rebotado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE doc_kind AS ENUM ('dni', 'pasaporte', 'cedula', 'licencia', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE audit_action AS ENUM (
        'create', 'update', 'delete', 'login', 'logout',
        'status_change', 'permission_change', 'export'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
