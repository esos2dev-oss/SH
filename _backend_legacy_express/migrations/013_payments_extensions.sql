-- =============================================================================
-- 013 — Extensiones de Pagos (pago movil VE, conciliacion bancaria, tasa BCV)
-- =============================================================================
-- Objetivo: soportar el flujo real venezolano (pago movil con referencia + banco),
-- estado de confirmacion separado del estado contable, pagos sueltos sin reserva,
-- conversion a moneda base via tasa BCV y conciliacion contra extracto bancario.
--
-- Estrategia: solo aditivo. No se rompe nada del schema previo.
-- booking_payments mantiene su nombre (la API publica habla de "payments").

-- -----------------------------------------------------------------------------
-- 1. Nuevos valores en enum payment_method
-- -----------------------------------------------------------------------------
-- NOTA: ALTER TYPE ... ADD VALUE no es transaccional en PG <12. En PG 17 si lo es
-- dentro del bloque, pero el valor agregado NO puede usarse en la misma transaccion
-- que lo crea. Por eso esta migracion no inserta filas que dependan de ellos.
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'pago_movil';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'zelle';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'punto_venta';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'efectivo_usd';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'efectivo_bs';

-- -----------------------------------------------------------------------------
-- 2. Enum de estado de confirmacion del pago (independiente de ledger_status)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE payment_confirmation_status AS ENUM (
        'pending_confirmation',
        'confirmed',
        'rejected'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 3. Tasa de cambio diaria (BCV o manual)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exchange_rates (
    fecha       DATE             PRIMARY KEY,
    bs_per_usd  NUMERIC(12,4)    NOT NULL CHECK (bs_per_usd > 0),
    source      VARCHAR(20)      NOT NULL DEFAULT 'manual',
    set_by      BIGINT,
    created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_exchange_rates_user FOREIGN KEY (set_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_fecha ON exchange_rates(fecha DESC);

-- -----------------------------------------------------------------------------
-- 4. Extracto bancario importado (cabecera) y movimientos (lineas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_statements (
    id              BIGSERIAL        PRIMARY KEY,
    banco           VARCHAR(50)      NOT NULL,
    cuenta          VARCHAR(50),
    fecha_desde     DATE             NOT NULL,
    fecha_hasta     DATE             NOT NULL,
    moneda          CHAR(3)          NOT NULL DEFAULT 'VES',
    original_name   VARCHAR(255)     NOT NULL,
    file_url        VARCHAR(500),
    total_movs      INTEGER          NOT NULL DEFAULT 0,
    matched_movs    INTEGER          NOT NULL DEFAULT 0,
    uploaded_by     BIGINT           NOT NULL,
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_bank_statements_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_bank_statements_fechas CHECK (fecha_hasta >= fecha_desde)
);

CREATE INDEX IF NOT EXISTS idx_bank_statements_banco_fecha ON bank_statements(banco, fecha_desde DESC);

CREATE TABLE IF NOT EXISTS bank_statement_movements (
    id              BIGSERIAL        PRIMARY KEY,
    statement_id    BIGINT           NOT NULL,
    fecha           DATE             NOT NULL,
    referencia      VARCHAR(100),
    descripcion     TEXT,
    monto           NUMERIC(14,2)    NOT NULL,
    tipo            CHAR(1)          NOT NULL CHECK (tipo IN ('C','D')),
    moneda          CHAR(3)          NOT NULL DEFAULT 'VES',
    matched_payment_id BIGINT,
    raw_line        TEXT,
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_bsm_statement FOREIGN KEY (statement_id) REFERENCES bank_statements(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bsm_statement   ON bank_statement_movements(statement_id);
CREATE INDEX IF NOT EXISTS idx_bsm_ref_fecha   ON bank_statement_movements(referencia, fecha) WHERE referencia IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bsm_unmatched   ON bank_statement_movements(statement_id) WHERE matched_payment_id IS NULL;

-- -----------------------------------------------------------------------------
-- 5. Extender booking_payments para pago_movil VE + estado + pagos sueltos
-- -----------------------------------------------------------------------------
ALTER TABLE booking_payments
    ADD COLUMN IF NOT EXISTS status         payment_confirmation_status NOT NULL DEFAULT 'confirmed',
    ADD COLUMN IF NOT EXISTS method_details JSONB                       NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS monto_base     NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS tasa_cambio    NUMERIC(12,4),
    ADD COLUMN IF NOT EXISTS customer_id    BIGINT,
    ADD COLUMN IF NOT EXISTS bank_match_id  BIGINT,
    ADD COLUMN IF NOT EXISTS confirmed_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS confirmed_by   BIGINT,
    ADD COLUMN IF NOT EXISTS rejected_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejected_by    BIGINT,
    ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
    ADD COLUMN IF NOT EXISTS reversed_by_id BIGINT;

-- booking_id deja de ser NOT NULL para permitir pagos sueltos asociados solo al huesped
ALTER TABLE booking_payments ALTER COLUMN booking_id DROP NOT NULL;

-- FKs nuevas
DO $$ BEGIN
    ALTER TABLE booking_payments
        ADD CONSTRAINT fk_booking_payments_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE booking_payments
        ADD CONSTRAINT fk_booking_payments_bank_match FOREIGN KEY (bank_match_id) REFERENCES bank_statement_movements(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE booking_payments
        ADD CONSTRAINT fk_booking_payments_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE booking_payments
        ADD CONSTRAINT fk_booking_payments_rejected_by FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE booking_payments
        ADD CONSTRAINT fk_booking_payments_reversed_by FOREIGN KEY (reversed_by_id) REFERENCES booking_payments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Garantizar que cada pago tenga al menos booking_id o customer_id
DO $$ BEGIN
    ALTER TABLE booking_payments
        ADD CONSTRAINT chk_booking_payments_target CHECK (booking_id IS NOT NULL OR customer_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cerrar la referencia inversa de FK a bank_statement_movements
DO $$ BEGIN
    ALTER TABLE bank_statement_movements
        ADD CONSTRAINT fk_bsm_matched_payment FOREIGN KEY (matched_payment_id) REFERENCES booking_payments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_payments_status      ON booking_payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_customer    ON booking_payments(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_pending     ON booking_payments(status, pagado_at DESC) WHERE status = 'pending_confirmation';
CREATE INDEX IF NOT EXISTS idx_payments_ref_method  ON booking_payments(method, referencia) WHERE referencia IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 6. Cierres de caja por turno
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_closures (
    id              BIGSERIAL        PRIMARY KEY,
    codigo          VARCHAR(20)      NOT NULL UNIQUE,
    user_id         BIGINT           NOT NULL,
    opened_at       TIMESTAMPTZ      NOT NULL,
    closed_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    totals          JSONB            NOT NULL DEFAULT '{}'::jsonb,
    pending_count   INTEGER          NOT NULL DEFAULT 0,
    notas           TEXT,
    signature_url   VARCHAR(500),
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_cash_closures_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_cash_closures_fechas CHECK (closed_at >= opened_at)
);

CREATE INDEX IF NOT EXISTS idx_cash_closures_user_fecha ON cash_closures(user_id, closed_at DESC);

-- -----------------------------------------------------------------------------
-- 7. Soporte de codigo PM (payment) en code_sequences (no migracion, solo nota)
-- -----------------------------------------------------------------------------
-- code_sequences acepta cualquier prefijo (PK = prefix,year). No requiere DDL.
-- El generador usa 'PM' para payments y 'CC' para cash_closures.

-- -----------------------------------------------------------------------------
-- 8. RLS (permisivo para mantener consistencia con migracion 012)
-- -----------------------------------------------------------------------------
ALTER TABLE booking_payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_closures          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_payments_all ON booking_payments;
CREATE POLICY p_payments_all ON booking_payments
    FOR ALL
    USING (
        current_user_role() IN ('superadmin','admin','recepcion','contabilidad')
    )
    WITH CHECK (
        current_user_role() IN ('superadmin','admin','recepcion','contabilidad')
    );

DROP POLICY IF EXISTS p_exchange_rates_select ON exchange_rates;
CREATE POLICY p_exchange_rates_select ON exchange_rates FOR SELECT USING (true);

DROP POLICY IF EXISTS p_exchange_rates_write ON exchange_rates;
CREATE POLICY p_exchange_rates_write ON exchange_rates
    FOR ALL
    USING (current_user_role() IN ('superadmin','admin','recepcion','contabilidad'))
    WITH CHECK (current_user_role() IN ('superadmin','admin','recepcion','contabilidad'));

DROP POLICY IF EXISTS p_bank_statements_all ON bank_statements;
CREATE POLICY p_bank_statements_all ON bank_statements
    FOR ALL
    USING (current_user_role() IN ('superadmin','admin','contabilidad'))
    WITH CHECK (current_user_role() IN ('superadmin','admin','contabilidad'));

DROP POLICY IF EXISTS p_bsm_all ON bank_statement_movements;
CREATE POLICY p_bsm_all ON bank_statement_movements
    FOR ALL
    USING (current_user_role() IN ('superadmin','admin','contabilidad'))
    WITH CHECK (current_user_role() IN ('superadmin','admin','contabilidad'));

DROP POLICY IF EXISTS p_cash_closures_all ON cash_closures;
CREATE POLICY p_cash_closures_all ON cash_closures
    FOR ALL
    USING (
        current_user_role() IN ('superadmin','admin','contabilidad')
        OR (current_user_role() = 'recepcion' AND user_id = current_user_id())
    )
    WITH CHECK (
        current_user_role() IN ('superadmin','admin','contabilidad','recepcion')
    );
