-- =============================================================================
-- 014 — Plantillas de mensajes WhatsApp
-- =============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id          BIGSERIAL      PRIMARY KEY,
    slug        VARCHAR(50)    NOT NULL UNIQUE,
    nombre      VARCHAR(150)   NOT NULL,
    body        TEXT           NOT NULL,
    descripcion VARCHAR(300),
    active      BOOLEAN        NOT NULL DEFAULT true,
    updated_by  BIGINT,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_whatsapp_templates_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_active ON whatsapp_templates(active);

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_whatsapp_templates_select ON whatsapp_templates;
CREATE POLICY p_whatsapp_templates_select ON whatsapp_templates
    FOR SELECT USING (current_user_role() IN ('superadmin','admin','recepcion','contabilidad'));

DROP POLICY IF EXISTS p_whatsapp_templates_write ON whatsapp_templates;
CREATE POLICY p_whatsapp_templates_write ON whatsapp_templates
    FOR ALL
    USING (current_user_role() IN ('superadmin','admin'))
    WITH CHECK (current_user_role() IN ('superadmin','admin'));
