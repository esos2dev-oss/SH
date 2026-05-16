-- =============================================================================
-- 004 — Room Types y Rooms
-- =============================================================================

CREATE TABLE room_types (
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

CREATE TABLE rooms (
    id            BIGSERIAL     PRIMARY KEY,
    numero        VARCHAR(20)   NOT NULL UNIQUE,
    room_type_id  BIGINT        NOT NULL,
    planta        VARCHAR(20),
    status        room_status   NOT NULL DEFAULT 'disponible',
    notas         TEXT,
    photo_url     VARCHAR(500),
    active        BOOLEAN       NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_rooms_type
        FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE RESTRICT
);

CREATE INDEX idx_rooms_status ON rooms(status) WHERE active = true;
CREATE INDEX idx_rooms_planta ON rooms(planta);
CREATE INDEX idx_rooms_type   ON rooms(room_type_id);
