import { describe, it, expect } from 'vitest';
import { formatCurrency, stayCoversDay, startOfDay, toLocalDateKey } from './format';

describe('formatCurrency', () => {
  it('usa "Bs." y no el obsoleto "Bs.S" para bolivares', () => {
    const out = formatCurrency(1234.5, 'VES');
    expect(out).toContain('Bs.');
    expect(out).not.toContain('Bs.S');
  });

  it('respeta la moneda que se le pasa', () => {
    expect(formatCurrency(10, 'EUR')).not.toEqual(formatCurrency(10, 'USD'));
  });

  it('no revienta con un codigo de moneda desconocido', () => {
    expect(formatCurrency(10, 'XYZ')).toContain('XYZ');
  });

  it('trata valores no finitos como 0 en vez de imprimir NaN', () => {
    expect(formatCurrency(Number.NaN, 'USD')).not.toContain('NaN');
  });
});

describe('stayCoversDay', () => {
  // Bug 2: las reservas se guardan con entrada 14:00 y salida 11:00. El
  // calendario comparaba esos instantes contra la medianoche de cada celda,
  // asi que no pintaba el dia de llegada y si pintaba el de salida.
  // Reserva real del reporte: BK-2026-0064, del 10/09 al 12/09.
  const entrada = '2026-09-10T14:00:00';
  const salida = '2026-09-12T11:00:00';

  const dia = (d: number) => new Date(2026, 8, d); // mes 8 = septiembre

  it('pinta el dia de llegada', () => {
    expect(stayCoversDay(entrada, salida, dia(10))).toBe(true);
  });

  it('pinta las noches intermedias', () => {
    expect(stayCoversDay(entrada, salida, dia(11))).toBe(true);
  });

  it('NO pinta el dia de salida (esa noche la habitacion queda libre)', () => {
    expect(stayCoversDay(entrada, salida, dia(12))).toBe(false);
  });

  it('no pinta el dia anterior a la llegada', () => {
    expect(stayCoversDay(entrada, salida, dia(9))).toBe(false);
  });

  it('una estancia de una sola noche ocupa exactamente un dia', () => {
    const dias = [9, 10, 11].map((d) =>
      stayCoversDay('2026-09-10T14:00:00', '2026-09-11T11:00:00', dia(d)),
    );
    expect(dias).toEqual([false, true, false]);
  });

  it('una llegada de hoy aparece hoy aunque sean las 14:00', () => {
    const hoy = new Date(2026, 6, 29);
    expect(stayCoversDay('2026-07-29T14:00:00', '2026-07-31T11:00:00', hoy)).toBe(true);
  });
});

describe('helpers de dia local', () => {
  it('startOfDay lleva a medianoche local', () => {
    const d = startOfDay('2026-09-10T14:35:12');
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(10);
  });

  it('toLocalDateKey no se va al dia anterior por culpa de UTC', () => {
    // Con toISOString() una fecha local de madrugada podia devolver el dia previo.
    const d = new Date(2026, 8, 10, 1, 0, 0);
    expect(toLocalDateKey(d)).toBe('2026-09-10');
  });
});
