-- =============================================================================
-- 016 — DROP del modulo marketing (promotions, email, whatsapp).
-- =============================================================================
-- El sistema ya no usa estas tablas. Las eliminamos para no confundir y para
-- evitar tener basura en el schema productivo.
--
-- Orden de drop: primero tablas dependientes, luego principales, luego enums.
-- Usamos CASCADE para arrastrar FKs, indices y politicas RLS asociadas.

-- Triggers de updated_at en tablas a eliminar (deja de ser necesario despues del drop, pero limpiamos por si quedan en caches)
DROP TRIGGER IF EXISTS set_updated_at ON promotions;
DROP TRIGGER IF EXISTS set_updated_at ON email_templates;

-- Tablas en orden inverso de dependencia
DROP TABLE IF EXISTS email_logs        CASCADE;
DROP TABLE IF EXISTS email_campaigns   CASCADE;
DROP TABLE IF EXISTS email_templates   CASCADE;
DROP TABLE IF EXISTS booking_promotions CASCADE;
DROP TABLE IF EXISTS promotions        CASCADE;
DROP TABLE IF EXISTS whatsapp_templates CASCADE;

-- Enums que ya nadie usa
DROP TYPE IF EXISTS email_event CASCADE;
DROP TYPE IF EXISTS email_status CASCADE;
DROP TYPE IF EXISTS promotion_kind CASCADE;
