-- =============================================================================
-- 010 — Audit log y settings
-- =============================================================================

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

    CONSTRAINT fk_auditlog_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_user    ON audit_log(user_id);
CREATE INDEX idx_audit_entity  ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_action  ON audit_log(action);


CREATE TABLE settings (
    key         VARCHAR(100)   PRIMARY KEY,
    value       JSONB          NOT NULL,
    updated_by  BIGINT,
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
