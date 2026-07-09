-- =============================================================================
-- Tarifas en bolivares (opcional) para room_types.
-- =============================================================================
-- Permite fijar el precio directamente en Bs, ademas del USD. Si el campo es
-- NULL, el sistema convierte del USD usando la tasa BCV del dia (tabla
-- exchange_rates).

ALTER TABLE public.room_types
    ADD COLUMN IF NOT EXISTS tarifa_dia_bs    NUMERIC(12,2) CHECK (tarifa_dia_bs    IS NULL OR tarifa_dia_bs    >= 0),
    ADD COLUMN IF NOT EXISTS tarifa_semana_bs NUMERIC(12,2) CHECK (tarifa_semana_bs IS NULL OR tarifa_semana_bs >= 0),
    ADD COLUMN IF NOT EXISTS tarifa_mes_bs    NUMERIC(12,2) CHECK (tarifa_mes_bs    IS NULL OR tarifa_mes_bs    >= 0);

COMMENT ON COLUMN public.room_types.tarifa_dia_bs IS
    'Tarifa por dia en Bs. Si NULL, se convierte desde tarifa_dia usando exchange_rates.';
