-- =============================================================================
-- 011 — Trigger generico de updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a todas las tablas con updated_at
DO $$
DECLARE
    t TEXT;
    tables_with_updated_at TEXT[] := ARRAY[
        'users',
        'room_types',
        'rooms',
        'customers',
        'bookings',
        'check_ins',
        'promotions',
        'email_templates'
    ];
BEGIN
    FOREACH t IN ARRAY tables_with_updated_at
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS set_updated_at ON %I;
            CREATE TRIGGER set_updated_at
                BEFORE UPDATE ON %I
                FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
        ', t, t);
    END LOOP;
END $$;
