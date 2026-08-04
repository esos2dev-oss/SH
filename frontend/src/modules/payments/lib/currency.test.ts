import { describe, it, expect } from 'vitest';
import {
  convertNumber,
  convertAmount,
  unitsPerUsd,
  toBaseUsd,
  rateAgeDays,
  isRateStale,
  type RateSnapshot,
} from './currency';

// Tasa de referencia: 1 USD = 36,50 Bs = 0,92 EUR
const RATE: RateSnapshot = { fecha: '2026-07-29', bs_per_usd: 36.5, eur_per_usd: 0.92 };
const RATE_SIN_EUR: RateSnapshot = { fecha: '2026-07-29', bs_per_usd: 36.5, eur_per_usd: null };

describe('unitsPerUsd', () => {
  it('USD siempre vale 1 aunque no haya tasa', () => {
    expect(unitsPerUsd('USD', null)).toBe(1);
  });

  it('devuelve null si falta la tasa de la moneda', () => {
    expect(unitsPerUsd('VES', null)).toBeNull();
    expect(unitsPerUsd('EUR', RATE_SIN_EUR)).toBeNull();
    expect(unitsPerUsd('GBP', RATE)).toBeNull();
  });
});

describe('convertNumber', () => {
  it('no toca el importe si la moneda no cambia', () => {
    expect(convertNumber(320, 'EUR', 'EUR', null)).toBe(320);
  });

  it('convierte EUR a Bs pasando por la base', () => {
    // 320 EUR / 0,92 = 347,83 USD -> x 36,5 = 12.695,65 Bs
    expect(convertNumber(320, 'EUR', 'VES', RATE)).toBeCloseTo(12695.65, 2);
  });

  it('convierte Bs a EUR', () => {
    expect(convertNumber(12695.65, 'VES', 'EUR', RATE)).toBeCloseTo(320, 1);
  });

  it('devuelve null si no hay tasa para alguna de las dos monedas', () => {
    expect(convertNumber(100, 'EUR', 'VES', RATE_SIN_EUR)).toBeNull();
    expect(convertNumber(100, 'VES', 'USD', null)).toBeNull();
  });

  // Este es el bug 1: 38 Bs + 38 EUR se sumaban como 76 EUR y la reserva de
  // 76 EUR quedaba saldada, cuando en realidad se habian cobrado ~38 EUR.
  it('38 Bs NO equivalen a 38 EUR', () => {
    const enEur = convertNumber(38, 'VES', 'EUR', RATE);
    expect(enEur).not.toBeNull();
    expect(enEur!).toBeLessThan(1);
    expect(enEur!).toBeCloseTo(0.96, 2);
  });

  it('el total real de 38 Bs + 38 EUR esta lejos de 76 EUR', () => {
    const pagoBs = convertNumber(38, 'VES', 'EUR', RATE)!;
    const total = pagoBs + 38;
    expect(total).toBeLessThan(40);
    expect(76 - total).toBeGreaterThan(35); // seguia debiendo casi la reserva entera
  });
});

describe('toBaseUsd', () => {
  it('lleva cualquier moneda a USD', () => {
    expect(toBaseUsd(36.5, 'VES', RATE)).toBeCloseTo(1, 2);
    expect(toBaseUsd(0.92, 'EUR', RATE)).toBeCloseTo(1, 2);
    expect(toBaseUsd(5, 'USD', RATE)).toBe(5);
  });
});

describe('convertAmount (campo de formulario)', () => {
  // Bug 3: al elegir Pago Movil, el formulario cambiaba la etiqueta de moneda
  // a VES dejando el numero 320 (que estaba en EUR). Se registraban 320 Bs.
  it('convierte el saldo en EUR al pasar a VES en vez de reetiquetarlo', () => {
    const out = convertAmount('320', 'EUR', 'VES', RATE);
    expect(out).not.toBeNull();
    expect(Number(out)).toBeCloseTo(12695.65, 1);
    expect(out).not.toBe('320');
  });

  it('devuelve null si no puede convertir, para que la UI vacie el campo', () => {
    expect(convertAmount('320', 'EUR', 'VES', RATE_SIN_EUR)).toBeNull();
  });

  it('deja pasar el valor si el campo esta vacio o no es un numero util', () => {
    expect(convertAmount('', 'EUR', 'VES', RATE)).toBe('');
    expect(convertAmount('0', 'EUR', 'VES', RATE)).toBe('0');
  });
});

describe('antiguedad de la tasa', () => {
  const hoy = new Date('2026-07-29T10:00:00');

  it('calcula los dias transcurridos', () => {
    expect(rateAgeDays({ ...RATE, fecha: '2026-07-29' }, hoy)).toBe(0);
    expect(rateAgeDays({ ...RATE, fecha: '2026-07-25' }, hoy)).toBe(4);
  });

  // Bug 15: el aviso solo saltaba si NO habia tasa; con una de hace 4 dias
  // la interfaz callaba y cada Pago Movil se cobraba a la tasa vieja.
  it('una tasa de hace 4 dias esta vencida', () => {
    expect(isRateStale({ ...RATE, fecha: '2026-07-25' }, 1, hoy)).toBe(true);
  });

  it('la tasa de hoy no esta vencida', () => {
    expect(isRateStale({ ...RATE, fecha: '2026-07-29' }, 1, hoy)).toBe(false);
  });

  it('la tasa de ayer todavia se acepta con el margen por defecto', () => {
    expect(isRateStale({ ...RATE, fecha: '2026-07-28' }, 1, hoy)).toBe(false);
  });

  it('sin tasa se considera vencida', () => {
    expect(isRateStale(null)).toBe(true);
  });
});
