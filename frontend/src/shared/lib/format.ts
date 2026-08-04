// Formatters comunes para UI.

/** Moneda base del sistema. Todos los agregados contables vienen en esta moneda. */
export const BASE_CURRENCY = 'USD';

/**
 * Formatea un importe.
 *
 * `currency` es OBLIGATORIA a proposito: el default 'USD' anterior hacia que
 * media aplicacion mostrara importes en euros con simbolo de dolar (o al reves)
 * simplemente por olvidarse del segundo argumento. Si no sabes la moneda,
 * es que hay un bug aguas arriba.
 *
 * VES se formatea a mano porque Intl con locale es-VE emite "Bs.S", el nombre
 * del bolivar soberano 2018-2021. Hoy es "Bs.".
 */
export function formatCurrency(amount: number, currency: string, locale = 'es-VE'): string {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  const code = (currency || BASE_CURRENCY).toUpperCase();

  if (code === 'VES') {
    const n = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
    return `Bs. ${n}`;
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
    }).format(safe);
  } catch {
    // Codigo de moneda desconocido por Intl: no reventamos la pantalla.
    return `${safe.toFixed(2)} ${code}`;
  }
}

/** Atajo para importes que ya vienen en moneda base. */
export function formatBase(amount: number, locale = 'es-VE'): string {
  return formatCurrency(amount, BASE_CURRENCY, locale);
}

export function formatDate(date: Date | string, locale = 'es-VE'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function formatDateTime(date: Date | string, locale = 'es-VE'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

// =============================================================================
// Helpers de dia calendario
// =============================================================================
// Las reservas se guardan como TIMESTAMPTZ con hora de entrada 14:00 y salida
// 11:00. Comparar esos instantes contra la medianoche de una celda del
// calendario desplazaba todo un dia (bug 2): la llegada no se pintaba y el dia
// de salida si. Todo lo que sea "que dia es esto" tiene que pasar por aqui.

/** Medianoche local del dia al que pertenece la fecha dada. */
export function startOfDay(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** `YYYY-MM-DD` en hora local (NO usar toISOString, que convierte a UTC). */
export function toLocalDateKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * ¿La estancia [entrada, salida) ocupa el dia `day`?
 * Semantica hotelera: se ocupa la noche de la llegada, NO la del check-out.
 */
export function stayCoversDay(entrada: Date | string, salida: Date | string, day: Date): boolean {
  const d = startOfDay(day).getTime();
  return startOfDay(entrada).getTime() <= d && d < startOfDay(salida).getTime();
}
