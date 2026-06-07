-- =============================================================================
-- Fix: next_code() debe ejecutarse como SECURITY DEFINER para poder escribir
-- en code_sequences sin chocar contra RLS del usuario llamante.
-- =============================================================================
-- code_sequences es una tabla de infraestructura (counter de codigos) que
-- ningun usuario deberia tocar directamente. La funcion la encapsula.

ALTER TABLE public.code_sequences ENABLE ROW LEVEL SECURITY;

-- Sin politicas: nadie puede leer/escribir directamente. Solo via next_code().

CREATE OR REPLACE FUNCTION public.next_code(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.next_code(text) TO authenticated;
