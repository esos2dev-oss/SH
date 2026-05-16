-- =============================================================================
-- 015 — Receipt URL en pagos (capturas de pago movil/zelle)
-- =============================================================================

ALTER TABLE booking_payments
    ADD COLUMN IF NOT EXISTS receipt_url   VARCHAR(500),
    ADD COLUMN IF NOT EXISTS receipt_mime  VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_payments_with_receipt
    ON booking_payments(id) WHERE receipt_url IS NOT NULL;
