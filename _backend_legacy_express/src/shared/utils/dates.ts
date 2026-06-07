// Utilidades de fecha sin libreria pesada.
// Para formateo en UI usamos date-fns en frontend; aqui trabajamos con timestamps.

const MS_DIA = 24 * 60 * 60 * 1000;
const MS_SEMANA = 7 * MS_DIA;

export function diffDias(entrada: Date, salida: Date): number {
  const diff = salida.getTime() - entrada.getTime();
  return Math.max(0, Math.ceil(diff / MS_DIA));
}

export function diffSemanas(entrada: Date, salida: Date): number {
  const diff = salida.getTime() - entrada.getTime();
  return Math.max(0, Math.ceil(diff / MS_SEMANA));
}

/** Aproximacion: 30 dias por mes. Para precision real usar libreria. */
export function diffMeses(entrada: Date, salida: Date): number {
  const diff = salida.getTime() - entrada.getTime();
  return Math.max(0, Math.ceil(diff / (30 * MS_DIA)));
}

export function isOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Devuelve YYYY-MM-DD en UTC. */
export function toISODateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}
