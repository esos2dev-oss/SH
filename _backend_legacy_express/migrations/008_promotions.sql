-- =============================================================================
-- 008 — Promociones
-- =============================================================================

CREATE TABLE promotions (
    id              BIGSERIAL         PRIMARY KEY,
    codigo          VARCHAR(50)       NOT NULL UNIQUE,
    nombre          VARCHAR(150)      NOT NULL,
    descripcion     TEXT,
    kind            promotion_kind    NOT NULL,
    valor           NUMERIC(12,2)     NOT NULL CHECK (valor > 0),
    moneda          CHAR(3),
    fecha_inicio    DATE              NOT NULL,
    fecha_fin       DATE              NOT NULL,
    max_usos        INTEGER           CHECK (max_usos IS NULL OR max_usos > 0),
    usos_actuales   INTEGER           NOT NULL DEFAULT 0 CHECK (usos_actuales >= 0),
    condiciones     JSONB             NOT NULL DEFAULT '{}'::jsonb,
    active          BOOLEAN           NOT NULL DEFAULT true,
    created_by      BIGINT            NOT NULL,
    created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_promotions_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_promotions_dates  CHECK (fecha_fin >= fecha_inicio),
    CONSTRAINT chk_promotions_pct    CHECK (kind <> 'porcentaje' OR valor BETWEEN 0 AND 100)
);

CREATE INDEX idx_promotions_codigo  ON promotions(codigo) WHERE active = true;
CREATE INDEX idx_promotions_periodo ON promotions(fecha_inicio, fecha_fin);


CREATE TABLE booking_promotions (
    id                  BIGSERIAL      PRIMARY KEY,
    booking_id          BIGINT         NOT NULL,
    promotion_id        BIGINT         NOT NULL,
    descuento_aplicado  NUMERIC(12,2)  NOT NULL CHECK (descuento_aplicado >= 0),
    aplicado_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_bp_booking   FOREIGN KEY (booking_id)   REFERENCES bookings(id)   ON DELETE CASCADE,
    CONSTRAINT fk_bp_promotion FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE RESTRICT,
    CONSTRAINT uq_bp_booking_promo UNIQUE (booking_id, promotion_id)
);
