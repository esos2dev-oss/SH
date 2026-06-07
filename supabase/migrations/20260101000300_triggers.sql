-- =============================================================================
-- Trigger generico updated_at + transiciones automaticas room/booking
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
    tables_with_updated_at TEXT[] := ARRAY[
        'profiles', 'room_types', 'rooms', 'customers', 'bookings', 'check_ins'
    ];
BEGIN
    FOREACH t IN ARRAY tables_with_updated_at
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS set_updated_at ON public.%I;
            CREATE TRIGGER set_updated_at
                BEFORE UPDATE ON public.%I
                FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();
        ', t, t);
    END LOOP;
END $$;

-- =============================================================================
-- Generador de codigos legibles
-- =============================================================================
CREATE OR REPLACE FUNCTION public.next_code(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    y INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
    n INTEGER;
BEGIN
    INSERT INTO public.code_sequences (prefix, year, counter)
    VALUES (p_prefix, y, 1)
    ON CONFLICT (prefix, year) DO UPDATE
        SET counter = code_sequences.counter + 1
    RETURNING counter INTO n;

    RETURN p_prefix || '-' || y || '-' || lpad(n::text, 4, '0');
END;
$$;
