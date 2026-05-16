-- =============================================================================
-- 007 — Ledger (categorias, asientos, recibos)
-- =============================================================================

CREATE TABLE ledger_categories (
    id          BIGSERIAL       PRIMARY KEY,
    nombre      VARCHAR(100)    NOT NULL,
    slug        VARCHAR(100)    NOT NULL UNIQUE,
    type        ledger_type     NOT NULL,
    active      BOOLEAN         NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE ledger_entries (
    id              BIGSERIAL        PRIMARY KEY,
    codigo          VARCHAR(20)      NOT NULL UNIQUE,
    type            ledger_type      NOT NULL,
    category_id     BIGINT           NOT NULL,
    fecha           DATE             NOT NULL,
    descripcion     VARCHAR(500)     NOT NULL,
    monto           NUMERIC(12,2)    NOT NULL CHECK (monto > 0),
    moneda          CHAR(3)          NOT NULL,
    method          payment_method,
    booking_id      BIGINT,
    customer_id     BIGINT,
    reverses_id     BIGINT,
    status          ledger_status    NOT NULL DEFAULT 'registrado',
    registered_by   BIGINT           NOT NULL,
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ledger_category FOREIGN KEY (category_id)   REFERENCES ledger_categories(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ledger_booking  FOREIGN KEY (booking_id)    REFERENCES bookings(id)          ON DELETE SET NULL,
    CONSTRAINT fk_ledger_customer FOREIGN KEY (customer_id)   REFERENCES customers(id)         ON DELETE SET NULL,
    CONSTRAINT fk_ledger_reverses FOREIGN KEY (reverses_id)   REFERENCES ledger_entries(id),
    CONSTRAINT fk_ledger_user     FOREIGN KEY (registered_by) REFERENCES users(id)             ON DELETE RESTRICT
);

CREATE INDEX idx_ledger_fecha      ON ledger_entries(fecha);
CREATE INDEX idx_ledger_type_fecha ON ledger_entries(type, fecha);
CREATE INDEX idx_ledger_category   ON ledger_entries(category_id);
CREATE INDEX idx_ledger_booking    ON ledger_entries(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_ledger_status     ON ledger_entries(status);

-- FK ahora que existe ledger_entries
ALTER TABLE booking_payments
    ADD CONSTRAINT fk_booking_payments_ledger
    FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id) ON DELETE SET NULL;


CREATE TABLE receipts (
    id              BIGSERIAL      PRIMARY KEY,
    ledger_entry_id BIGINT         NOT NULL,
    file_url        VARCHAR(500)   NOT NULL,
    kind            receipt_kind   NOT NULL,
    mime_type       VARCHAR(100)   NOT NULL,
    size_bytes      BIGINT         NOT NULL CHECK (size_bytes > 0),
    original_name   VARCHAR(255)   NOT NULL,
    uploaded_by     BIGINT         NOT NULL,
    active          BOOLEAN        NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_receipts_ledger FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id) ON DELETE CASCADE,
    CONSTRAINT fk_receipts_user   FOREIGN KEY (uploaded_by)     REFERENCES users(id)          ON DELETE RESTRICT
);

CREATE INDEX idx_receipts_ledger ON receipts(ledger_entry_id);
