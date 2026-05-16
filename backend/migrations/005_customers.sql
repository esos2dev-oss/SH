-- =============================================================================
-- 005 — Customers
-- =============================================================================

CREATE TABLE customers (
    id                 BIGSERIAL      PRIMARY KEY,
    nombres            VARCHAR(150)   NOT NULL,
    apellidos          VARCHAR(150)   NOT NULL,
    doc_kind           doc_kind       NOT NULL DEFAULT 'otro',
    doc_numero         VARCHAR(50)    NOT NULL,
    email              VARCHAR(255),
    telefono           VARCHAR(50),
    fecha_nacimiento   DATE,
    nacionalidad       VARCHAR(100),
    direccion          TEXT,
    preferencias       JSONB          NOT NULL DEFAULT '{}'::jsonb,
    notas              TEXT,
    accepts_marketing  BOOLEAN        NOT NULL DEFAULT false,
    active             BOOLEAN        NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_customers_doc UNIQUE (doc_kind, doc_numero)
);

CREATE INDEX idx_customers_email    ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_nombre   ON customers(apellidos, nombres);
CREATE INDEX idx_customers_birth_md ON customers(
    (EXTRACT(MONTH FROM fecha_nacimiento)),
    (EXTRACT(DAY FROM fecha_nacimiento))
) WHERE fecha_nacimiento IS NOT NULL;
