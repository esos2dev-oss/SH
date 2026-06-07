-- =============================================================================
-- 006 — Bookings, Booking Payments, Check-Ins, Booking Promotions
-- =============================================================================

CREATE TABLE bookings (
    id                BIGSERIAL        PRIMARY KEY,
    codigo            VARCHAR(20)      NOT NULL UNIQUE,
    customer_id       BIGINT           NOT NULL,
    room_id           BIGINT           NOT NULL,
    period            booking_period   NOT NULL,
    fecha_entrada     TIMESTAMPTZ      NOT NULL,
    fecha_salida      TIMESTAMPTZ      NOT NULL,
    huespedes         INTEGER          NOT NULL DEFAULT 1 CHECK (huespedes >= 1),
    tarifa_aplicada   NUMERIC(12,2)    NOT NULL CHECK (tarifa_aplicada >= 0),
    descuento_pct     NUMERIC(5,2)     NOT NULL DEFAULT 0 CHECK (descuento_pct BETWEEN 0 AND 100),
    descuento_monto   NUMERIC(12,2)    NOT NULL DEFAULT 0 CHECK (descuento_monto >= 0),
    importe_total     NUMERIC(12,2)    NOT NULL CHECK (importe_total >= 0),
    importe_pagado    NUMERIC(12,2)    NOT NULL DEFAULT 0 CHECK (importe_pagado >= 0),
    moneda            CHAR(3)          NOT NULL,
    payment_status    payment_status   NOT NULL DEFAULT 'pendiente',
    status            booking_status   NOT NULL DEFAULT 'pendiente',
    origen            VARCHAR(50)      NOT NULL DEFAULT 'recepcion',
    notas             TEXT,
    cancelled_at      TIMESTAMPTZ,
    cancelled_reason  TEXT,
    created_by        BIGINT           NOT NULL,
    created_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_bookings_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_room     FOREIGN KEY (room_id)     REFERENCES rooms(id)     ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_creator  FOREIGN KEY (created_by)  REFERENCES users(id)     ON DELETE RESTRICT,
    CONSTRAINT chk_bookings_dates           CHECK (fecha_salida > fecha_entrada),
    CONSTRAINT chk_bookings_pago_no_excede  CHECK (importe_pagado <= importe_total)
);

CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_room     ON bookings(room_id);
CREATE INDEX idx_bookings_status   ON bookings(status);
CREATE INDEX idx_bookings_fechas   ON bookings(fecha_entrada, fecha_salida);
CREATE INDEX idx_bookings_creator  ON bookings(created_by);

-- Constraint exclusivo: no solapamiento de bookings activos en la misma habitacion
ALTER TABLE bookings
    ADD CONSTRAINT excl_bookings_no_solape
    EXCLUDE USING gist (
        room_id WITH =,
        tstzrange(fecha_entrada, fecha_salida, '[)') WITH &&
    )
    WHERE (status IN ('pendiente', 'confirmada', 'en_curso'));


CREATE TABLE booking_payments (
    id              BIGSERIAL        PRIMARY KEY,
    booking_id      BIGINT           NOT NULL,
    monto           NUMERIC(12,2)    NOT NULL CHECK (monto > 0),
    moneda          CHAR(3)          NOT NULL,
    method          payment_method   NOT NULL,
    referencia      VARCHAR(100),
    pagado_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    registered_by   BIGINT           NOT NULL,
    ledger_entry_id BIGINT,
    notas           TEXT,
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_booking_payments_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_booking_payments_user
        FOREIGN KEY (registered_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_booking_payments_booking ON booking_payments(booking_id);
CREATE INDEX idx_booking_payments_fecha   ON booking_payments(pagado_at);


CREATE TABLE check_ins (
    id                       BIGSERIAL     PRIMARY KEY,
    booking_id               BIGINT        NOT NULL UNIQUE,
    hora_entrada             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    hora_salida              TIMESTAMPTZ,
    firma_url                VARCHAR(500),
    documento_url            VARCHAR(500),
    huespedes_acompaniantes  JSONB         NOT NULL DEFAULT '[]'::jsonb,
    observaciones            TEXT,
    registered_by            BIGINT        NOT NULL,
    checked_out_by           BIGINT,
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_checkins_booking FOREIGN KEY (booking_id)     REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_checkins_user    FOREIGN KEY (registered_by)  REFERENCES users(id)    ON DELETE RESTRICT,
    CONSTRAINT fk_checkins_co_user FOREIGN KEY (checked_out_by) REFERENCES users(id)    ON DELETE RESTRICT
);
