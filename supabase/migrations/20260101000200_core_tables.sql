-- =============================================================================
-- Core tables: rooms, customers, bookings, payments, check_ins, ledger, audit
-- =============================================================================
-- Adaptacion del schema legacy a Supabase:
--  - Toda referencia previa a users(BIGINT) -> profiles(UUID)
--  - Sin tabla user_sessions (Supabase Auth la sustituye)
--  - Sin promotions/email/whatsapp (descartados)

-- =============================================================================
-- Rooms
-- =============================================================================
CREATE TABLE public.room_types (
    id            BIGSERIAL      PRIMARY KEY,
    nombre        VARCHAR(100)   NOT NULL UNIQUE,
    slug          VARCHAR(100)   NOT NULL UNIQUE,
    descripcion   TEXT,
    capacidad     INTEGER        NOT NULL CHECK (capacidad > 0),
    tarifa_dia    NUMERIC(12,2)  NOT NULL CHECK (tarifa_dia >= 0),
    tarifa_semana NUMERIC(12,2)  CHECK (tarifa_semana IS NULL OR tarifa_semana >= 0),
    tarifa_mes    NUMERIC(12,2)  CHECK (tarifa_mes IS NULL OR tarifa_mes >= 0),
    moneda        CHAR(3)        NOT NULL DEFAULT 'USD',
    amenities     JSONB          NOT NULL DEFAULT '[]'::jsonb,
    active        BOOLEAN        NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE public.rooms (
    id            BIGSERIAL              PRIMARY KEY,
    numero        VARCHAR(20)            NOT NULL UNIQUE,
    room_type_id  BIGINT                 NOT NULL REFERENCES public.room_types(id) ON DELETE RESTRICT,
    planta        VARCHAR(20),
    status        public.room_status     NOT NULL DEFAULT 'disponible',
    notas         TEXT,
    photo_url     VARCHAR(500),
    active        BOOLEAN                NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ            NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rooms_status ON public.rooms(status) WHERE active = true;
CREATE INDEX idx_rooms_planta ON public.rooms(planta);
CREATE INDEX idx_rooms_type   ON public.rooms(room_type_id);

-- =============================================================================
-- Customers
-- =============================================================================
CREATE TABLE public.customers (
    id                 BIGSERIAL         PRIMARY KEY,
    nombres            VARCHAR(150)      NOT NULL,
    apellidos          VARCHAR(150)      NOT NULL,
    doc_kind           public.doc_kind   NOT NULL DEFAULT 'otro',
    doc_numero         VARCHAR(50)       NOT NULL,
    email              VARCHAR(255),
    telefono           VARCHAR(50),
    fecha_nacimiento   DATE,
    nacionalidad       VARCHAR(100),
    direccion          TEXT,
    preferencias       JSONB             NOT NULL DEFAULT '{}'::jsonb,
    notas              TEXT,
    accepts_marketing  BOOLEAN           NOT NULL DEFAULT false,
    active             BOOLEAN           NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customers_doc UNIQUE (doc_kind, doc_numero)
);

CREATE INDEX idx_customers_email    ON public.customers(email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_nombre   ON public.customers(apellidos, nombres);
CREATE INDEX idx_customers_birth_md ON public.customers(
    (EXTRACT(MONTH FROM fecha_nacimiento)),
    (EXTRACT(DAY FROM fecha_nacimiento))
) WHERE fecha_nacimiento IS NOT NULL;

-- =============================================================================
-- Bookings
-- =============================================================================
CREATE TABLE public.bookings (
    id                BIGSERIAL              PRIMARY KEY,
    codigo            VARCHAR(20)            NOT NULL UNIQUE,
    customer_id       BIGINT                 NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    room_id           BIGINT                 NOT NULL REFERENCES public.rooms(id)     ON DELETE RESTRICT,
    period            public.booking_period  NOT NULL,
    fecha_entrada     TIMESTAMPTZ            NOT NULL,
    fecha_salida      TIMESTAMPTZ            NOT NULL,
    huespedes         INTEGER                NOT NULL DEFAULT 1 CHECK (huespedes >= 1),
    tarifa_aplicada   NUMERIC(12,2)          NOT NULL CHECK (tarifa_aplicada >= 0),
    descuento_pct     NUMERIC(5,2)           NOT NULL DEFAULT 0 CHECK (descuento_pct BETWEEN 0 AND 100),
    descuento_monto   NUMERIC(12,2)          NOT NULL DEFAULT 0 CHECK (descuento_monto >= 0),
    importe_total     NUMERIC(12,2)          NOT NULL CHECK (importe_total >= 0),
    importe_pagado    NUMERIC(12,2)          NOT NULL DEFAULT 0 CHECK (importe_pagado >= 0),
    moneda            CHAR(3)                NOT NULL,
    payment_status    public.payment_status  NOT NULL DEFAULT 'pendiente',
    status            public.booking_status  NOT NULL DEFAULT 'pendiente',
    origen            VARCHAR(50)            NOT NULL DEFAULT 'recepcion',
    notas             TEXT,
    cancelled_at      TIMESTAMPTZ,
    cancelled_reason  TEXT,
    created_by        UUID                   NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at        TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_bookings_dates          CHECK (fecha_salida > fecha_entrada),
    CONSTRAINT chk_bookings_pago_no_excede CHECK (importe_pagado <= importe_total)
);

CREATE INDEX idx_bookings_customer ON public.bookings(customer_id);
CREATE INDEX idx_bookings_room     ON public.bookings(room_id);
CREATE INDEX idx_bookings_status   ON public.bookings(status);
CREATE INDEX idx_bookings_fechas   ON public.bookings(fecha_entrada, fecha_salida);
CREATE INDEX idx_bookings_creator  ON public.bookings(created_by);

-- No solapamiento: una habitacion no puede tener dos bookings activos en mismo rango
ALTER TABLE public.bookings
    ADD CONSTRAINT excl_bookings_no_solape
    EXCLUDE USING gist (
        room_id WITH =,
        tstzrange(fecha_entrada, fecha_salida, '[)') WITH &&
    )
    WHERE (status IN ('pendiente', 'confirmada', 'en_curso'));

-- =============================================================================
-- Payments (booking_payments + extensiones pago_movil VE)
-- =============================================================================
CREATE TABLE public.booking_payments (
    id              BIGSERIAL                            PRIMARY KEY,
    booking_id      BIGINT                               REFERENCES public.bookings(id)  ON DELETE CASCADE,
    customer_id     BIGINT                               REFERENCES public.customers(id) ON DELETE SET NULL,
    monto           NUMERIC(12,2)                        NOT NULL CHECK (monto > 0),
    moneda          CHAR(3)                              NOT NULL,
    monto_base      NUMERIC(12,2),
    tasa_cambio     NUMERIC(12,4),
    method          public.payment_method                NOT NULL,
    method_details  JSONB                                NOT NULL DEFAULT '{}'::jsonb,
    referencia      VARCHAR(100),
    receipt_url     VARCHAR(500),
    receipt_mime    VARCHAR(100),
    pagado_at       TIMESTAMPTZ                          NOT NULL DEFAULT NOW(),
    status          public.payment_confirmation_status   NOT NULL DEFAULT 'confirmed',
    registered_by   UUID                                 NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    confirmed_at    TIMESTAMPTZ,
    confirmed_by    UUID                                 REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejected_at     TIMESTAMPTZ,
    rejected_by     UUID                                 REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejected_reason TEXT,
    reversed_by_id  BIGINT                               REFERENCES public.booking_payments(id) ON DELETE SET NULL,
    bank_match_id   BIGINT,
    ledger_entry_id BIGINT,
    notas           TEXT,
    created_at      TIMESTAMPTZ                          NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_booking_payments_target CHECK (booking_id IS NOT NULL OR customer_id IS NOT NULL)
);

CREATE INDEX idx_booking_payments_booking ON public.booking_payments(booking_id);
CREATE INDEX idx_booking_payments_fecha   ON public.booking_payments(pagado_at);
CREATE INDEX idx_payments_status          ON public.booking_payments(status);
CREATE INDEX idx_payments_customer        ON public.booking_payments(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_payments_pending         ON public.booking_payments(status, pagado_at DESC) WHERE status = 'pending_confirmation';
CREATE INDEX idx_payments_ref_method      ON public.booking_payments(method, referencia) WHERE referencia IS NOT NULL;
CREATE INDEX idx_payments_with_receipt    ON public.booking_payments(id) WHERE receipt_url IS NOT NULL;

-- =============================================================================
-- Check-ins
-- =============================================================================
CREATE TABLE public.check_ins (
    id                       BIGSERIAL     PRIMARY KEY,
    booking_id               BIGINT        NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
    hora_entrada             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    hora_salida              TIMESTAMPTZ,
    firma_url                VARCHAR(500),
    documento_url            VARCHAR(500),
    huespedes_acompaniantes  JSONB         NOT NULL DEFAULT '[]'::jsonb,
    observaciones            TEXT,
    registered_by            UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    checked_out_by           UUID                   REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Ledger (categorias, asientos, recibos)
-- =============================================================================
CREATE TABLE public.ledger_categories (
    id          BIGSERIAL          PRIMARY KEY,
    nombre      VARCHAR(100)       NOT NULL,
    slug        VARCHAR(100)       NOT NULL UNIQUE,
    type        public.ledger_type NOT NULL,
    active      BOOLEAN            NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE TABLE public.ledger_entries (
    id              BIGSERIAL             PRIMARY KEY,
    codigo          VARCHAR(20)           NOT NULL UNIQUE,
    type            public.ledger_type    NOT NULL,
    category_id     BIGINT                NOT NULL REFERENCES public.ledger_categories(id) ON DELETE RESTRICT,
    fecha           DATE                  NOT NULL,
    descripcion     VARCHAR(500)          NOT NULL,
    monto           NUMERIC(12,2)         NOT NULL CHECK (monto > 0),
    moneda          CHAR(3)               NOT NULL,
    method          public.payment_method,
    booking_id      BIGINT                REFERENCES public.bookings(id)  ON DELETE SET NULL,
    customer_id     BIGINT                REFERENCES public.customers(id) ON DELETE SET NULL,
    reverses_id     BIGINT                REFERENCES public.ledger_entries(id),
    status          public.ledger_status  NOT NULL DEFAULT 'registrado',
    registered_by   UUID                  NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_fecha      ON public.ledger_entries(fecha);
CREATE INDEX idx_ledger_type_fecha ON public.ledger_entries(type, fecha);
CREATE INDEX idx_ledger_category   ON public.ledger_entries(category_id);
CREATE INDEX idx_ledger_booking    ON public.ledger_entries(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_ledger_status     ON public.ledger_entries(status);

-- FK diferida desde booking_payments
ALTER TABLE public.booking_payments
    ADD CONSTRAINT fk_booking_payments_ledger
    FOREIGN KEY (ledger_entry_id) REFERENCES public.ledger_entries(id) ON DELETE SET NULL;

-- =============================================================================
-- Receipts (archivos adjuntos a ledger_entries) — guardados en bucket Storage
-- =============================================================================
CREATE TABLE public.receipts (
    id              BIGSERIAL          PRIMARY KEY,
    ledger_entry_id BIGINT             NOT NULL REFERENCES public.ledger_entries(id) ON DELETE CASCADE,
    storage_path    VARCHAR(500)       NOT NULL,
    kind            public.receipt_kind NOT NULL,
    mime_type       VARCHAR(100)       NOT NULL,
    size_bytes      BIGINT             NOT NULL CHECK (size_bytes > 0),
    original_name   VARCHAR(255)       NOT NULL,
    uploaded_by     UUID               NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    active          BOOLEAN            NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_receipts_ledger ON public.receipts(ledger_entry_id);

-- =============================================================================
-- Tasas de cambio (BCV / manual)
-- =============================================================================
CREATE TABLE public.exchange_rates (
    fecha       DATE             PRIMARY KEY,
    bs_per_usd  NUMERIC(12,4)    NOT NULL CHECK (bs_per_usd > 0),
    source      VARCHAR(20)      NOT NULL DEFAULT 'manual',
    set_by      UUID             REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exchange_rates_fecha ON public.exchange_rates(fecha DESC);

-- =============================================================================
-- Bank statements y movimientos (conciliacion)
-- =============================================================================
CREATE TABLE public.bank_statements (
    id              BIGSERIAL     PRIMARY KEY,
    banco           VARCHAR(50)   NOT NULL,
    cuenta          VARCHAR(50),
    fecha_desde     DATE          NOT NULL,
    fecha_hasta     DATE          NOT NULL,
    moneda          CHAR(3)       NOT NULL DEFAULT 'VES',
    original_name   VARCHAR(255)  NOT NULL,
    storage_path    VARCHAR(500),
    total_movs      INTEGER       NOT NULL DEFAULT 0,
    matched_movs    INTEGER       NOT NULL DEFAULT 0,
    uploaded_by     UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_bank_statements_fechas CHECK (fecha_hasta >= fecha_desde)
);

CREATE INDEX idx_bank_statements_banco_fecha ON public.bank_statements(banco, fecha_desde DESC);

CREATE TABLE public.bank_statement_movements (
    id                  BIGSERIAL     PRIMARY KEY,
    statement_id        BIGINT        NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
    fecha               DATE          NOT NULL,
    referencia          VARCHAR(100),
    descripcion         TEXT,
    monto               NUMERIC(14,2) NOT NULL,
    tipo                CHAR(1)       NOT NULL CHECK (tipo IN ('C','D')),
    moneda              CHAR(3)       NOT NULL DEFAULT 'VES',
    matched_payment_id  BIGINT        REFERENCES public.booking_payments(id) ON DELETE SET NULL,
    raw_line            TEXT,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bsm_statement ON public.bank_statement_movements(statement_id);
CREATE INDEX idx_bsm_ref_fecha ON public.bank_statement_movements(referencia, fecha) WHERE referencia IS NOT NULL;
CREATE INDEX idx_bsm_unmatched ON public.bank_statement_movements(statement_id) WHERE matched_payment_id IS NULL;

ALTER TABLE public.booking_payments
    ADD CONSTRAINT fk_booking_payments_bank_match
    FOREIGN KEY (bank_match_id) REFERENCES public.bank_statement_movements(id) ON DELETE SET NULL;

-- =============================================================================
-- Cierres de caja
-- =============================================================================
CREATE TABLE public.cash_closures (
    id              BIGSERIAL     PRIMARY KEY,
    codigo          VARCHAR(20)   NOT NULL UNIQUE,
    user_id         UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    opened_at       TIMESTAMPTZ   NOT NULL,
    closed_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    totals          JSONB         NOT NULL DEFAULT '{}'::jsonb,
    pending_count   INTEGER       NOT NULL DEFAULT 0,
    notas           TEXT,
    signature_url   VARCHAR(500),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cash_closures_fechas CHECK (closed_at >= opened_at)
);

CREATE INDEX idx_cash_closures_user_fecha ON public.cash_closures(user_id, closed_at DESC);

-- =============================================================================
-- Audit log y settings
-- =============================================================================
CREATE TABLE public.audit_log (
    id          BIGSERIAL          PRIMARY KEY,
    user_id     UUID               REFERENCES public.profiles(id) ON DELETE SET NULL,
    action      public.audit_action NOT NULL,
    entity      VARCHAR(50)        NOT NULL,
    entity_id   TEXT,
    before      JSONB,
    after       JSONB,
    ip          INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user    ON public.audit_log(user_id);
CREATE INDEX idx_audit_entity  ON public.audit_log(entity, entity_id);
CREATE INDEX idx_audit_created ON public.audit_log(created_at DESC);
CREATE INDEX idx_audit_action  ON public.audit_log(action);

CREATE TABLE public.settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       JSONB        NOT NULL,
    updated_by  UUID         REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
