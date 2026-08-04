// Conversion de importes entre las monedas que maneja el hotel.
//
// La moneda base del sistema es USD. `exchange_rates` guarda cuantas unidades
// de cada moneda equivalen a 1 USD:
//   bs_per_usd  -> bolivares por dolar
//   eur_per_usd -> euros por dolar
//
// Todo importe que cambie de moneda en la UI tiene que pasar por aqui. El bug 3
// (registrar 320 Bs cuando habia que cobrar 320 EUR) fue exactamente esto:
// cambiar la etiqueta de moneda sin convertir el numero.

export interface RateSnapshot {
  fecha: string;
  bs_per_usd: number;
  eur_per_usd: number | null;
}

export type SupportedCurrency = 'USD' | 'VES' | 'EUR';

/** Cuantas unidades de `currency` equivalen a 1 USD. null si no se sabe. */
export function unitsPerUsd(currency: string, rate: RateSnapshot | null): number | null {
  const c = (currency || '').toUpperCase();
  if (c === 'USD') return 1;
  if (!rate) return null;
  if (c === 'VES') return rate.bs_per_usd > 0 ? rate.bs_per_usd : null;
  if (c === 'EUR') return rate.eur_per_usd && rate.eur_per_usd > 0 ? rate.eur_per_usd : null;
  return null;
}

/** Convierte un numero entre monedas. Devuelve null si falta alguna tasa. */
export function convertNumber(
  amount: number,
  from: string,
  to: string,
  rate: RateSnapshot | null,
): number | null {
  if (!Number.isFinite(amount)) return null;
  const f = (from || '').toUpperCase();
  const t = (to || '').toUpperCase();
  if (f === t) return amount;

  const fromRate = unitsPerUsd(f, rate);
  const toRate = unitsPerUsd(t, rate);
  if (fromRate === null || toRate === null) return null;

  const usd = amount / fromRate;
  return Math.round(usd * toRate * 100) / 100;
}

/**
 * Version para inputs de formulario: recibe y devuelve strings.
 * Devuelve null si no se pudo convertir (para que la UI vacie el campo en vez
 * de dejar una cifra enganosa).
 */
export function convertAmount(
  amount: string,
  from: string,
  to: string,
  rate: RateSnapshot | null,
): string | null {
  const n = Number(amount);
  if (!amount || !Number.isFinite(n) || n <= 0) return amount;
  const out = convertNumber(n, from, to, rate);
  return out === null ? null : out.toFixed(2);
}

/** Importe expresado en la moneda base (USD). */
export function toBaseUsd(amount: number, currency: string, rate: RateSnapshot | null): number | null {
  return convertNumber(amount, currency, 'USD', rate);
}

/** Antiguedad de la tasa en dias completos. null si no hay tasa. */
export function rateAgeDays(rate: RateSnapshot | null, today = new Date()): number | null {
  if (!rate?.fecha) return null;
  const d = new Date(`${rate.fecha}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((t.getTime() - d.getTime()) / 86400000));
}

/**
 * Una tasa de hace dias es dinero perdido en cada cobro en Bs (bug 15).
 * El aviso anterior solo saltaba si NO habia ninguna tasa; nunca si estaba vieja.
 */
export function isRateStale(rate: RateSnapshot | null, maxAgeDays = 1, today = new Date()): boolean {
  const age = rateAgeDays(rate, today);
  return age === null || age > maxAgeDays;
}
