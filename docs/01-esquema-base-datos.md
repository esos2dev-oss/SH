# 01 — Esquema de Base de Datos

> **Motor:** PostgreSQL 17
> **Codificacion:** UTF-8
> **Modulo de cifrado:** `pgcrypto` (UUID, hashing complementario)
> **Seguridad:** Row Level Security activado en tablas marcadas con (RLS)

---

## 1. Convenciones

| Convencion | Detalle |
|------------|---------|
| **Naming** | `snake_case` para tablas, columnas, indices, ENUMs |
| **Primary Key** | `id BIGSERIAL` (autoincremental). UUID solo si se necesita exposicion publica del id |
| **Timestamps** | `TIMESTAMPTZ` con `DEFAULT NOW()` para `created_at` y `updated_at` |
| **Soft delete** | `active BOOLEAN DEFAULT true`. No se eliminan filas fisicamente salvo en jobs administrativos |
| **Foreign Keys** | Nombradas `fk_<tabla>_<columna>`. `ON DELETE` explicito (CASCADE solo en relaciones de pertenencia) |
| **Indices** | Nombrados `idx_<tabla>_<columnas>`. Indices unicos como `uq_<tabla>_<columnas>` |
| **Importes** | `NUMERIC(12,2)` (no `FLOAT`). Moneda en `VARCHAR(3)` ISO 4217 |
| **Calculos derivados** | `importe_pendiente`, `noches`, `dias_desde` se calculan en aplicacion, no se almacenan |
| **JSONB** | Para datos flexibles (preferencias, reglas de promocion, before/after de audit) |
| **RLS** | Activo por rol y por hotel cuando aplique. Politicas en migration aparte |

---

## 2. Tipos ENUM

```sql
-- ============================================================
-- ENUMs
-- ============================================================

CREATE TYPE user_role AS ENUM (
    'superadmin',
    'admin',
    'recepcion',
    'limpieza',
    'contabilidad'
);

CREATE TYPE room_status AS ENUM (
    'disponible',
    'ocupada',
    'limpieza',
    'mantenimiento',
    'fuera_servicio'
);

CREATE TYPE booking_period AS ENUM (
    'dia',
    'semana',
    'mes'
);

CREATE TYPE booking_status AS ENUM (
    'pendiente',
    'confirmada',
    'en_curso',
    'finalizada',
    'cancelada',
    'no_show'
);

CREATE TYPE payment_method AS ENUM (
    'efectivo',
    'tarjeta',
    'transferencia',
    'paypal',
    'otro'
);

CREATE TYPE payment_status AS ENUM (
    'pendiente',
    'parcial',
    'pagado',
    'reembolsado'
);

CREATE TYPE ledger_type AS ENUM (
    'ingreso',
    'egreso'
);

CREATE TYPE ledger_status AS ENUM (
    'registrado',
    'conciliado',
    'anulado'
);

CREATE TYPE receipt_kind AS ENUM (
    'imagen',
    'pdf'
);

CREATE TYPE promotion_kind AS ENUM (
    'porcentaje',
    'monto_fijo'
);

CREATE TYPE email_event AS ENUM (
    'bienvenida',
    'post_estancia',
    'fecha_especial',
    'recuperacion',
    'manual'
);

CREATE TYPE email_status AS ENUM (
    'pendiente',
    'enviado',
    'entregado',
    'abierto',
    'fallido',
    'rebotado'
);

CREATE TYPE doc_kind AS ENUM (
    'dni',
    'pasaporte',
    'cedula',
    'licencia',
    'otro'
);

CREATE TYPE audit_action AS ENUM (
    'create',
    'update',
    'delete',
    'login',
    'logout',
    'status_change',
    'permission_change',
    'export'
);
```

---

## 3. Tablas

### 3.1 `users` (RLS)

Usuarios del sistema con sus roles.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| nombre | VARCHAR(200) | NOT NULL |
| email | VARCHAR(255) | NOT NULL, UNIQUE |
| password_hash | VARCHAR(255) | NOT NULL |
| role | user_role | NOT NULL, DEFAULT 'recepcion' |
| active | BOOLEAN | NOT NULL, DEFAULT true |
| set_password_token | VARCHAR(255) | NULL |
| set_password_expires | TIMESTAMPTZ | NULL |
| last_login_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
CREATE TABLE users (
    id                    BIGSERIAL     PRIMARY KEY,
    nombre                VARCHAR(200)  NOT NULL,
    email                 VARCHAR(255)  NOT NULL UNIQUE,
    password_hash         VARCHAR(255)  NOT NULL,
    role                  user_role     NOT NULL DEFAULT 'recepcion',
    active                BOOLEAN       NOT NULL DEFAULT true,
    set_password_token    VARCHAR(255),
    set_password_expires  TIMESTAMPTZ,
    last_login_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email) WHERE active = true;
CREATE INDEX idx_users_role  ON users(role)  WHERE active = true;
```

---

### 3.2 `user_sessions`

Sesiones de refresh token (revocables). El access token nunca se almacena.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| user_id | BIGINT | NOT NULL, FK -> users(id) ON DELETE CASCADE |
| refresh_token_hash | VARCHAR(255) | NOT NULL, UNIQUE |
| ip | INET | NULL |
| user_agent | TEXT | NULL |
| expires_at | TIMESTAMPTZ | NOT NULL |
| revoked_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
CREATE TABLE user_sessions (
    id                  BIGSERIAL     PRIMARY KEY,
    user_id             BIGINT        NOT NULL,
    refresh_token_hash  VARCHAR(255)  NOT NULL UNIQUE,
    ip                  INET,
    user_agent          TEXT,
    expires_at          TIMESTAMPTZ   NOT NULL,
    revoked_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_user_sessions_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_sessions_user      ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires   ON user_sessions(expires_at);
```

---

### 3.3 `room_types`

Tipos de habitacion con sus tarifas por periodo.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| nombre | VARCHAR(100) | NOT NULL, UNIQUE (ej. "Sencilla", "Doble", "Suite") |
| slug | VARCHAR(100) | NOT NULL, UNIQUE |
| descripcion | TEXT | NULL |
| capacidad | INTEGER | NOT NULL, CHECK (capacidad > 0) |
| tarifa_dia | NUMERIC(12,2) | NOT NULL, CHECK (>= 0) |
| tarifa_semana | NUMERIC(12,2) | NULL |
| tarifa_mes | NUMERIC(12,2) | NULL |
| moneda | CHAR(3) | NOT NULL, DEFAULT 'USD' |
| amenities | JSONB | NOT NULL, DEFAULT '[]' (lista de strings) |
| active | BOOLEAN | NOT NULL, DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
CREATE TABLE room_types (
    id            BIGSERIAL      PRIMARY KEY,
    nombre        VARCHAR(100)   NOT NULL UNIQUE,
    slug          VARCHAR(100)   NOT NULL UNIQUE,
    descripcion   TEXT,
    capacidad     INTEGER        NOT NULL CHECK (capacidad > 0),
    tarifa_dia    NUMERIC(12,2)  NOT NULL CHECK (tarifa_dia >= 0),
    tarifa_semana NUMERIC(12,2)  CHECK (tarifa_semana >= 0),
    tarifa_mes    NUMERIC(12,2)  CHECK (tarifa_mes >= 0),
    moneda        CHAR(3)        NOT NULL DEFAULT 'USD',
    amenities     JSONB          NOT NULL DEFAULT '[]'::jsonb,
    active        BOOLEAN        NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
```

---

### 3.4 `rooms` (RLS)

Habitaciones individuales del hotel.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| numero | VARCHAR(20) | NOT NULL, UNIQUE (ej. "101", "S2-A") |
| room_type_id | BIGINT | NOT NULL, FK -> room_types(id) ON DELETE RESTRICT |
| planta | VARCHAR(20) | NULL |
| status | room_status | NOT NULL, DEFAULT 'disponible' |
| notas | TEXT | NULL |
| photo_url | VARCHAR(500) | NULL |
| active | BOOLEAN | NOT NULL, DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
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

CREATE INDEX idx_rooms_status      ON rooms(status) WHERE active = true;
CREATE INDEX idx_rooms_planta      ON rooms(planta);
CREATE INDEX idx_rooms_type        ON rooms(room_type_id);
```

---

### 3.5 `customers` (RLS)

Huespedes / clientes del hotel.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| nombres | VARCHAR(150) | NOT NULL |
| apellidos | VARCHAR(150) | NOT NULL |
| doc_kind | doc_kind | NOT NULL, DEFAULT 'otro' |
| doc_numero | VARCHAR(50) | NOT NULL |
| email | VARCHAR(255) | NULL |
| telefono | VARCHAR(50) | NULL |
| fecha_nacimiento | DATE | NULL |
| nacionalidad | VARCHAR(100) | NULL |
| direccion | TEXT | NULL |
| preferencias | JSONB | NOT NULL, DEFAULT '{}' |
| notas | TEXT | NULL |
| accepts_marketing | BOOLEAN | NOT NULL, DEFAULT false |
| active | BOOLEAN | NOT NULL, DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
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

    CONSTRAINT uq_customers_doc
        UNIQUE (doc_kind, doc_numero)
);

CREATE INDEX idx_customers_email      ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_nombre     ON customers(apellidos, nombres);
CREATE INDEX idx_customers_birth_md   ON customers((EXTRACT(MONTH FROM fecha_nacimiento)), (EXTRACT(DAY FROM fecha_nacimiento))) WHERE fecha_nacimiento IS NOT NULL;
```

---

### 3.6 `bookings` (RLS)

Reservas / alquileres. Vincula cliente con habitacion y periodo.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| codigo | VARCHAR(20) | NOT NULL, UNIQUE (humano: "BK-2026-0001") |
| customer_id | BIGINT | NOT NULL, FK -> customers(id) ON DELETE RESTRICT |
| room_id | BIGINT | NOT NULL, FK -> rooms(id) ON DELETE RESTRICT |
| period | booking_period | NOT NULL |
| fecha_entrada | TIMESTAMPTZ | NOT NULL |
| fecha_salida | TIMESTAMPTZ | NOT NULL |
| huespedes | INTEGER | NOT NULL, DEFAULT 1, CHECK (>= 1) |
| tarifa_aplicada | NUMERIC(12,2) | NOT NULL (snapshot del precio del room_type al momento) |
| descuento_pct | NUMERIC(5,2) | NOT NULL, DEFAULT 0, CHECK (0..100) |
| descuento_monto | NUMERIC(12,2) | NOT NULL, DEFAULT 0, CHECK (>= 0) |
| importe_total | NUMERIC(12,2) | NOT NULL, CHECK (>= 0) |
| importe_pagado | NUMERIC(12,2) | NOT NULL, DEFAULT 0, CHECK (>= 0) |
| moneda | CHAR(3) | NOT NULL |
| payment_status | payment_status | NOT NULL, DEFAULT 'pendiente' |
| status | booking_status | NOT NULL, DEFAULT 'pendiente' |
| origen | VARCHAR(50) | NOT NULL, DEFAULT 'recepcion' |
| notas | TEXT | NULL |
| cancelled_at | TIMESTAMPTZ | NULL |
| cancelled_reason | TEXT | NULL |
| created_by | BIGINT | NOT NULL, FK -> users(id) ON DELETE RESTRICT |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
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

    CONSTRAINT fk_bookings_customer
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_room
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_creator
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_bookings_dates
        CHECK (fecha_salida > fecha_entrada),
    CONSTRAINT chk_bookings_pago_no_excede
        CHECK (importe_pagado <= importe_total)
);

CREATE INDEX idx_bookings_customer     ON bookings(customer_id);
CREATE INDEX idx_bookings_room         ON bookings(room_id);
CREATE INDEX idx_bookings_status       ON bookings(status);
CREATE INDEX idx_bookings_fechas       ON bookings(fecha_entrada, fecha_salida);
CREATE INDEX idx_bookings_creator      ON bookings(created_by);

-- Constraint exclusivo: no solapamiento de bookings activos en la misma habitacion
-- Requiere extension btree_gist
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE bookings
    ADD CONSTRAINT excl_bookings_no_solape
    EXCLUDE USING gist (
        room_id WITH =,
        tstzrange(fecha_entrada, fecha_salida, '[)') WITH &&
    )
    WHERE (status IN ('pendiente', 'confirmada', 'en_curso'));
```

> El constraint `excl_bookings_no_solape` impide a nivel BD que dos reservas activas pisen la misma habitacion en fechas que se solapen — el backend valida primero pero esto es la red de seguridad.

---

### 3.7 `booking_payments`

Pagos parciales o totales de una reserva.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| booking_id | BIGINT | NOT NULL, FK -> bookings(id) ON DELETE CASCADE |
| monto | NUMERIC(12,2) | NOT NULL, CHECK (> 0) |
| moneda | CHAR(3) | NOT NULL |
| method | payment_method | NOT NULL |
| referencia | VARCHAR(100) | NULL (numero de transaccion, voucher, etc.) |
| pagado_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| registered_by | BIGINT | NOT NULL, FK -> users(id) |
| ledger_entry_id | BIGINT | NULL, FK -> ledger_entries(id) (vinculo bidireccional) |
| notas | TEXT | NULL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
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
```

---

### 3.8 `check_ins`

Registro de check-in/check-out por reserva.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| booking_id | BIGINT | NOT NULL, UNIQUE, FK -> bookings(id) ON DELETE CASCADE |
| hora_entrada | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| hora_salida | TIMESTAMPTZ | NULL |
| firma_url | VARCHAR(500) | NULL |
| documento_url | VARCHAR(500) | NULL |
| huespedes_acompaniantes | JSONB | NOT NULL, DEFAULT '[]' |
| observaciones | TEXT | NULL |
| registered_by | BIGINT | NOT NULL, FK -> users(id) |
| checked_out_by | BIGINT | NULL, FK -> users(id) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
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

    CONSTRAINT fk_checkins_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_checkins_user
        FOREIGN KEY (registered_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_checkins_checkout_user
        FOREIGN KEY (checked_out_by) REFERENCES users(id) ON DELETE RESTRICT
);
```

---

### 3.9 `ledger_categories`

Categorias para ingresos y egresos.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| nombre | VARCHAR(100) | NOT NULL |
| slug | VARCHAR(100) | NOT NULL, UNIQUE |
| type | ledger_type | NOT NULL |
| active | BOOLEAN | NOT NULL, DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
CREATE TABLE ledger_categories (
    id          BIGSERIAL       PRIMARY KEY,
    nombre      VARCHAR(100)    NOT NULL,
    slug        VARCHAR(100)    NOT NULL UNIQUE,
    type        ledger_type     NOT NULL,
    active      BOOLEAN         NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
```

> Seed inicial sugerido — Ingresos: `alquiler`, `extras`, `multas`, `otro`. Egresos: `salarios`, `servicios`, `mantenimiento`, `marketing`, `suministros`, `impuestos`, `otro`.

---

### 3.10 `ledger_entries` (RLS)

Asientos contables: ingresos y egresos.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| codigo | VARCHAR(20) | NOT NULL, UNIQUE (humano: "LG-2026-0001") |
| type | ledger_type | NOT NULL |
| category_id | BIGINT | NOT NULL, FK -> ledger_categories(id) |
| fecha | DATE | NOT NULL |
| descripcion | VARCHAR(500) | NOT NULL |
| monto | NUMERIC(12,2) | NOT NULL, CHECK (> 0) |
| moneda | CHAR(3) | NOT NULL |
| method | payment_method | NULL |
| booking_id | BIGINT | NULL, FK -> bookings(id) ON DELETE SET NULL |
| customer_id | BIGINT | NULL, FK -> customers(id) ON DELETE SET NULL |
| reverses_id | BIGINT | NULL, FK -> ledger_entries(id) (asiento que invierte) |
| status | ledger_status | NOT NULL, DEFAULT 'registrado' |
| registered_by | BIGINT | NOT NULL, FK -> users(id) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
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

    CONSTRAINT fk_ledger_category
        FOREIGN KEY (category_id) REFERENCES ledger_categories(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ledger_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
    CONSTRAINT fk_ledger_customer
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_ledger_reverses
        FOREIGN KEY (reverses_id) REFERENCES ledger_entries(id),
    CONSTRAINT fk_ledger_user
        FOREIGN KEY (registered_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_ledger_fecha       ON ledger_entries(fecha);
CREATE INDEX idx_ledger_type_fecha  ON ledger_entries(type, fecha);
CREATE INDEX idx_ledger_category    ON ledger_entries(category_id);
CREATE INDEX idx_ledger_booking     ON ledger_entries(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_ledger_status      ON ledger_entries(status);
```

> Cerrar el ciclo del pago: cuando se crea un `booking_payments` se crea automaticamente un `ledger_entries` de tipo `ingreso` y se enlaza ambas tablas. La logica vive en backend, no en triggers.

---

### 3.11 `receipts`

Comprobantes adjuntos a entradas del ledger.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| ledger_entry_id | BIGINT | NOT NULL, FK -> ledger_entries(id) ON DELETE CASCADE |
| file_url | VARCHAR(500) | NOT NULL (key R2) |
| kind | receipt_kind | NOT NULL |
| mime_type | VARCHAR(100) | NOT NULL |
| size_bytes | BIGINT | NOT NULL, CHECK (> 0) |
| original_name | VARCHAR(255) | NOT NULL |
| uploaded_by | BIGINT | NOT NULL, FK -> users(id) |
| active | BOOLEAN | NOT NULL, DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
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

    CONSTRAINT fk_receipts_ledger
        FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id) ON DELETE CASCADE,
    CONSTRAINT fk_receipts_user
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_receipts_ledger ON receipts(ledger_entry_id);
```

---

### 3.12 `promotions`

Promociones / codigos de descuento.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| codigo | VARCHAR(50) | NOT NULL, UNIQUE |
| nombre | VARCHAR(150) | NOT NULL |
| descripcion | TEXT | NULL |
| kind | promotion_kind | NOT NULL |
| valor | NUMERIC(12,2) | NOT NULL, CHECK (valor > 0) |
| moneda | CHAR(3) | NULL (solo si kind = monto_fijo) |
| fecha_inicio | DATE | NOT NULL |
| fecha_fin | DATE | NOT NULL |
| max_usos | INTEGER | NULL |
| usos_actuales | INTEGER | NOT NULL, DEFAULT 0 |
| condiciones | JSONB | NOT NULL, DEFAULT '{}' |
| active | BOOLEAN | NOT NULL, DEFAULT true |
| created_by | BIGINT | NOT NULL, FK -> users(id) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
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

    CONSTRAINT fk_promotions_creator
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_promotions_dates
        CHECK (fecha_fin >= fecha_inicio),
    CONSTRAINT chk_promotions_pct
        CHECK (kind <> 'porcentaje' OR valor BETWEEN 0 AND 100)
);

CREATE INDEX idx_promotions_codigo  ON promotions(codigo) WHERE active = true;
CREATE INDEX idx_promotions_periodo ON promotions(fecha_inicio, fecha_fin);
```

> `condiciones` ejemplo: `{"min_noches": 3, "room_type_ids": [1, 2], "dias_semana": [1,2,3,4,5]}`.

---

### 3.13 `booking_promotions`

Aplicacion historica de promociones a reservas.

```sql
CREATE TABLE booking_promotions (
    id                  BIGSERIAL      PRIMARY KEY,
    booking_id          BIGINT         NOT NULL,
    promotion_id        BIGINT         NOT NULL,
    descuento_aplicado  NUMERIC(12,2)  NOT NULL CHECK (descuento_aplicado >= 0),
    aplicado_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_bp_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_bp_promotion
        FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE RESTRICT,
    CONSTRAINT uq_bp_booking_promo
        UNIQUE (booking_id, promotion_id)
);
```

---

### 3.14 `email_templates`

Plantillas de email (transaccional y marketing).

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| nombre | VARCHAR(150) | NOT NULL, UNIQUE |
| event | email_event | NOT NULL |
| asunto | VARCHAR(255) | NOT NULL |
| body_html | TEXT | NOT NULL |
| body_text | TEXT | NULL |
| variables | JSONB | NOT NULL, DEFAULT '[]' (lista de variables esperadas) |
| active | BOOLEAN | NOT NULL, DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
CREATE TABLE email_templates (
    id          BIGSERIAL      PRIMARY KEY,
    nombre      VARCHAR(150)   NOT NULL UNIQUE,
    event       email_event    NOT NULL,
    asunto      VARCHAR(255)   NOT NULL,
    body_html   TEXT           NOT NULL,
    body_text   TEXT,
    variables   JSONB          NOT NULL DEFAULT '[]'::jsonb,
    active      BOOLEAN        NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
```

---

### 3.15 `email_campaigns`

Campañas (manuales o auto-disparadas por evento).

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| nombre | VARCHAR(150) | NOT NULL |
| template_id | BIGINT | NOT NULL, FK -> email_templates(id) |
| event | email_event | NOT NULL |
| segmento | JSONB | NOT NULL, DEFAULT '{}' (filtros para seleccionar customers) |
| programada_para | TIMESTAMPTZ | NULL |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'borrador' (borrador, programada, enviando, enviada, cancelada) |
| total_destinatarios | INTEGER | NOT NULL, DEFAULT 0 |
| total_enviados | INTEGER | NOT NULL, DEFAULT 0 |
| total_aperturas | INTEGER | NOT NULL, DEFAULT 0 |
| total_rebotes | INTEGER | NOT NULL, DEFAULT 0 |
| created_by | BIGINT | NOT NULL, FK -> users(id) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| sent_at | TIMESTAMPTZ | NULL |

```sql
CREATE TABLE email_campaigns (
    id                   BIGSERIAL      PRIMARY KEY,
    nombre               VARCHAR(150)   NOT NULL,
    template_id          BIGINT         NOT NULL,
    event                email_event    NOT NULL,
    segmento             JSONB          NOT NULL DEFAULT '{}'::jsonb,
    programada_para      TIMESTAMPTZ,
    status               VARCHAR(20)    NOT NULL DEFAULT 'borrador',
    total_destinatarios  INTEGER        NOT NULL DEFAULT 0,
    total_enviados       INTEGER        NOT NULL DEFAULT 0,
    total_aperturas      INTEGER        NOT NULL DEFAULT 0,
    total_rebotes        INTEGER        NOT NULL DEFAULT 0,
    created_by           BIGINT         NOT NULL,
    created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    sent_at              TIMESTAMPTZ,

    CONSTRAINT fk_campaigns_template
        FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE RESTRICT,
    CONSTRAINT fk_campaigns_creator
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_campaigns_status ON email_campaigns(status);
CREATE INDEX idx_campaigns_event  ON email_campaigns(event);
```

---

### 3.16 `email_logs`

Log de cada envio individual.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| campaign_id | BIGINT | NULL, FK -> email_campaigns(id) ON DELETE SET NULL |
| customer_id | BIGINT | NULL, FK -> customers(id) ON DELETE SET NULL |
| email | VARCHAR(255) | NOT NULL |
| asunto | VARCHAR(255) | NOT NULL |
| event | email_event | NOT NULL |
| status | email_status | NOT NULL, DEFAULT 'pendiente' |
| provider_id | VARCHAR(100) | NULL (id del envio en Resend) |
| sent_at | TIMESTAMPTZ | NULL |
| delivered_at | TIMESTAMPTZ | NULL |
| opened_at | TIMESTAMPTZ | NULL |
| error_msg | TEXT | NULL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
CREATE TABLE email_logs (
    id              BIGSERIAL       PRIMARY KEY,
    campaign_id     BIGINT,
    customer_id     BIGINT,
    email           VARCHAR(255)    NOT NULL,
    asunto          VARCHAR(255)    NOT NULL,
    event           email_event     NOT NULL,
    status          email_status    NOT NULL DEFAULT 'pendiente',
    provider_id     VARCHAR(100),
    sent_at         TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    opened_at       TIMESTAMPTZ,
    error_msg       TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_emaillogs_campaign
        FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE SET NULL,
    CONSTRAINT fk_emaillogs_customer
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE INDEX idx_emaillogs_campaign  ON email_logs(campaign_id);
CREATE INDEX idx_emaillogs_customer  ON email_logs(customer_id);
CREATE INDEX idx_emaillogs_status    ON email_logs(status);
CREATE INDEX idx_emaillogs_provider  ON email_logs(provider_id) WHERE provider_id IS NOT NULL;
```

---

### 3.17 `audit_log` (RLS — solo admin/superadmin)

Bitacora de acciones sensibles.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | BIGSERIAL | PK |
| user_id | BIGINT | NULL, FK -> users(id) ON DELETE SET NULL |
| action | audit_action | NOT NULL |
| entity | VARCHAR(50) | NOT NULL (ej. "booking", "room", "ledger_entry") |
| entity_id | BIGINT | NULL |
| before | JSONB | NULL |
| after | JSONB | NULL |
| ip | INET | NULL |
| user_agent | TEXT | NULL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
CREATE TABLE audit_log (
    id          BIGSERIAL      PRIMARY KEY,
    user_id     BIGINT,
    action      audit_action   NOT NULL,
    entity      VARCHAR(50)    NOT NULL,
    entity_id   BIGINT,
    before      JSONB,
    after       JSONB,
    ip          INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_auditlog_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_user      ON audit_log(user_id);
CREATE INDEX idx_audit_entity    ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_created   ON audit_log(created_at DESC);
CREATE INDEX idx_audit_action    ON audit_log(action);
```

---

### 3.18 `settings`

Configuracion clave-valor del hotel (singleton-like).

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| key | VARCHAR(100) | PK |
| value | JSONB | NOT NULL |
| updated_by | BIGINT | NULL, FK -> users(id) |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

```sql
CREATE TABLE settings (
    key         VARCHAR(100)   PRIMARY KEY,
    value       JSONB          NOT NULL,
    updated_by  BIGINT,
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_settings_user
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
```

> Keys esperadas: `hotel.nombre`, `hotel.moneda`, `hotel.zona_horaria`, `hotel.idioma`, `email.remitente`, `email.responder_a`, `politica.cancelacion`, `politica.checkin_hora`, `politica.checkout_hora`.

---

## 4. Row Level Security (RLS)

Activado al final de la migration `001_initial_schema.sql`. Las politicas se definen en `002_rls_policies.sql`.

### Patron general

El backend setea variables de sesion al inicio de cada request:

```sql
SET LOCAL app.current_user_id = '<id>';
SET LOCAL app.current_user_role = '<role>';
```

Las politicas leen estas variables para decidir acceso. Esto se hace en el middleware `rls.ts` con un `BEGIN ... SET LOCAL ... COMMIT` por request.

### Resumen de politicas

| Tabla | Politica simplificada |
|-------|----------------------|
| `users` | superadmin lee todo. Resto lee solo su propia fila |
| `rooms` | Todos los autenticados leen. Solo superadmin/admin/limpieza modifican (limpieza solo cambia status) |
| `customers` | Recepcion/admin/superadmin leen y modifican. Contabilidad lee. Limpieza no accede |
| `bookings` | Todos autenticados leen. Limpieza no escribe. Contabilidad lee, no escribe |
| `ledger_entries` | Solo admin/superadmin/contabilidad acceden |
| `audit_log` | Solo admin/superadmin leen. Insert via funcion SECURITY DEFINER |

> El detalle exacto de las politicas se documenta en la migration. Aqui va el principio rector.

---

## 5. Triggers basicos

### 5.1 `updated_at` automatico

Trigger generico aplicado a todas las tablas con `updated_at`:

```sql
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a cada tabla con updated_at:
-- CREATE TRIGGER set_updated_at BEFORE UPDATE ON <tabla>
-- FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
```

### 5.2 Generacion de codigos legibles

`bookings.codigo` (ej. `BK-2026-0001`) y `ledger_entries.codigo` (ej. `LG-2026-0001`) se generan en backend al insertar, no via trigger. Esto evita acoplar formato al motor BD.

---

## 6. Migracion inicial sugerida

Orden de los archivos en `backend/migrations/`:

```
001_extensions.sql            -- pgcrypto, btree_gist
002_enums.sql                 -- todos los tipos ENUM
003_users.sql                 -- users, user_sessions
004_rooms.sql                 -- room_types, rooms
005_customers.sql             -- customers
006_bookings.sql              -- bookings, booking_payments, booking_promotions, check_ins
007_ledger.sql                -- ledger_categories, ledger_entries, receipts
008_promotions.sql            -- promotions
009_email.sql                 -- email_templates, email_campaigns, email_logs
010_audit.sql                 -- audit_log, settings
011_triggers.sql              -- updated_at trigger aplicado a todas las tablas
012_rls_policies.sql          -- politicas RLS por rol
```

Seeds en `backend/seeds/`:

```
001_seed_admin.sql            -- usuario superadmin inicial (con set_password_token)
002_seed_room_types.sql       -- tipos basicos: sencilla, doble, suite
003_seed_ledger_categories.sql -- categorias predefinidas
004_seed_email_templates.sql  -- plantillas iniciales: bienvenida, post-estancia, recuperacion
005_seed_settings.sql         -- valores por defecto de settings
```

---

## 7. Resumen

- **18 tablas**, **13 ENUMs**, **3 extensiones** (`pgcrypto`, `btree_gist`)
- **RLS activo** en `users`, `rooms`, `customers`, `bookings`, `ledger_entries`, `audit_log`
- **No solapamiento de reservas** garantizado a nivel BD via constraint EXCLUDE
- **Soft delete** universal via `active = false`. Hard delete solo en jobs administrativos
- **Calculos derivados** (importe pendiente, dias de estancia) en aplicacion, no en BD
- **Audit log** centraliza toda accion sensible — fuente de verdad para "quien hizo que"
