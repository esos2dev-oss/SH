-- Agrega columna bs_per_eur para tasa BCV en euros.
ALTER TABLE exchange_rates
  ADD COLUMN IF NOT EXISTS bs_per_eur numeric(14,4);

-- Vista actual: ultima tasa (con ambas monedas).
CREATE OR REPLACE VIEW current_exchange_rate AS
  SELECT fecha, bs_per_usd, bs_per_eur, source, created_at
  FROM exchange_rates
  ORDER BY fecha DESC
  LIMIT 1;
