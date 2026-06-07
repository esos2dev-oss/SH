-- =============================================================================
-- 009 — Email templates, campaigns, logs
-- =============================================================================

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

    CONSTRAINT fk_campaigns_template FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE RESTRICT,
    CONSTRAINT fk_campaigns_creator  FOREIGN KEY (created_by)  REFERENCES users(id)            ON DELETE RESTRICT
);

CREATE INDEX idx_campaigns_status ON email_campaigns(status);
CREATE INDEX idx_campaigns_event  ON email_campaigns(event);


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

    CONSTRAINT fk_emaillogs_campaign FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE SET NULL,
    CONSTRAINT fk_emaillogs_customer FOREIGN KEY (customer_id) REFERENCES customers(id)       ON DELETE SET NULL
);

CREATE INDEX idx_emaillogs_campaign ON email_logs(campaign_id);
CREATE INDEX idx_emaillogs_customer ON email_logs(customer_id);
CREATE INDEX idx_emaillogs_status   ON email_logs(status);
CREATE INDEX idx_emaillogs_provider ON email_logs(provider_id) WHERE provider_id IS NOT NULL;
