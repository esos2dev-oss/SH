-- =============================================================================
-- 003 — Users y user_sessions
-- =============================================================================

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

CREATE INDEX idx_users_email ON users (LOWER(email)) WHERE active = true;
CREATE INDEX idx_users_role  ON users (role) WHERE active = true;
CREATE INDEX idx_users_set_pwd_token ON users (set_password_token) WHERE set_password_token IS NOT NULL;

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

CREATE INDEX idx_user_sessions_user    ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
