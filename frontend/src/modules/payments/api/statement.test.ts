import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseMock, type SupabaseMock } from '../../../test/supabase-mock';

// El modulo de supabase crea el cliente al importarse; lo sustituimos entero.
vi.mock('../../../shared/lib/supabase', () => ({
  get supabase() { return globalThis.__sbMock.client; },
  invokeFunction: vi.fn(),
}));

declare global {
  // eslint-disable-next-line no-var
  var __sbMock: SupabaseMock;
}

function setMock(m: SupabaseMock) {
  globalThis.__sbMock = m;
}

const RATE = { fecha: '2026-07-29', bs_per_usd: 36.5, eur_per_usd: 0.92, source: 'bcv' };

// Reserva real del reporte: BK-2026-0060, Carlos Estrada, Hab. 8.
// Total EUR 76,00. Pagos: 38 Bs (pago movil) + 38 EUR (efectivo).
const BOOKING = {
  id: 60,
  codigo: 'BK-2026-0060',
  status: 'confirmada',
  fecha_entrada: '2026-07-29T14:00:00+00:00',
  fecha_salida: '2026-07-31T11:00:00+00:00',
  importe_total: 76,
  moneda: 'EUR',
  customer: { id: 9, nombre: 'Carlos Estrada', telefono: '+58 414 000 0000' },
};

// monto_base lo calcula el trigger en la BD: 38/36.5 = 1.04 USD, 38/0.92 = 41.30 USD
const PAGOS = [
  { id: 1, monto: 38, moneda: 'VES', monto_base: 1.04, method: 'pago_movil', status: 'confirmed', referencia: '1234', pagado_at: '2026-07-29T10:00:00+00:00', customer: null },
  { id: 2, monto: 38, moneda: 'EUR', monto_base: 41.3, method: 'efectivo', status: 'confirmed', referencia: null, pagado_at: '2026-07-29T11:00:00+00:00', customer: null },
];

describe('getBookingStatement — monedas mezcladas (bug 1)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('NO da la reserva por saldada al sumar 38 Bs + 38 EUR', async () => {
    setMock(createSupabaseMock({
      bookings_with_relations: { data: [BOOKING], single: BOOKING },
      booking_payments: { data: PAGOS },
      exchange_rates: { data: [RATE], single: RATE },
    }));

    const { getBookingStatement } = await import('./payments.api');
    const st = await getBookingStatement(60);

    // El comportamiento anterior: 38 + 38 = 76 pagados, saldo 0, "Pagado".
    expect(st.summary.total_pagado_confirmado).not.toBeCloseTo(76, 1);
    expect(st.summary.saldo).toBeGreaterThan(0);
  });

  it('calcula el pagado real convirtiendo cada cobro a la moneda de la reserva', async () => {
    setMock(createSupabaseMock({
      bookings_with_relations: { data: [BOOKING], single: BOOKING },
      booking_payments: { data: PAGOS },
      exchange_rates: { data: [RATE], single: RATE },
    }));

    const { getBookingStatement } = await import('./payments.api');
    const st = await getBookingStatement(60);

    // base: 1.04 + 41.30 = 42.34 USD -> x0.92 = 38.95 EUR
    expect(st.summary.base_confirmado_usd).toBeCloseTo(42.34, 2);
    expect(st.summary.total_pagado_confirmado).toBeCloseTo(38.95, 1);
    // Sigue debiendo ~37 EUR, casi la mitad de la reserva.
    expect(st.summary.saldo).toBeCloseTo(37.05, 1);
  });

  it('mantiene cada linea en la moneda en que se cobro', async () => {
    setMock(createSupabaseMock({
      bookings_with_relations: { data: [BOOKING], single: BOOKING },
      booking_payments: { data: PAGOS },
      exchange_rates: { data: [RATE], single: RATE },
    }));

    const { getBookingStatement } = await import('./payments.api');
    const st = await getBookingStatement(60);

    const pagos = st.lines.filter((l) => l.kind === 'payment');
    expect(pagos.map((p) => p.moneda)).toEqual(['VES', 'EUR']);
    expect(pagos.map((p) => p.monto)).toEqual([-38, -38]);
  });

  it('separa confirmados de pendientes de confirmacion', async () => {
    const pagos = [
      { ...PAGOS[0], status: 'pending_confirmation' },
      PAGOS[1],
    ];
    setMock(createSupabaseMock({
      bookings_with_relations: { data: [BOOKING], single: BOOKING },
      booking_payments: { data: pagos },
      exchange_rates: { data: [RATE], single: RATE },
    }));

    const { getBookingStatement } = await import('./payments.api');
    const st = await getBookingStatement(60);

    expect(st.summary.base_confirmado_usd).toBeCloseTo(41.3, 2);
    expect(st.summary.total_pagado_pendiente).toBeGreaterThan(0);
    // saldo_efectivo ignora lo que aun no esta confirmado
    expect(st.summary.saldo_efectivo).toBeGreaterThan(st.summary.saldo);
  });

  it('avisa cuando algun pago no se pudo convertir en vez de contarlo como 0', async () => {
    const pagos = [
      { ...PAGOS[0], monto_base: null, moneda: 'GBP' }, // sin tasa posible
      PAGOS[1],
    ];
    setMock(createSupabaseMock({
      bookings_with_relations: { data: [BOOKING], single: BOOKING },
      booking_payments: { data: pagos },
      exchange_rates: { data: [RATE], single: RATE },
    }));

    const { getBookingStatement } = await import('./payments.api');
    const st = await getBookingStatement(60);

    expect(st.summary.pagos_sin_convertir).toBe(1);
  });

  it('un cobro en la propia moneda de la reserva se imputa integro', async () => {
    setMock(createSupabaseMock({
      bookings_with_relations: { data: [BOOKING], single: BOOKING },
      booking_payments: { data: [PAGOS[1]] },
      exchange_rates: { data: [RATE], single: RATE },
    }));

    const { getBookingStatement } = await import('./payments.api');
    const st = await getBookingStatement(60);

    expect(st.summary.total_pagado_confirmado).toBeCloseTo(38, 1);
  });
});
