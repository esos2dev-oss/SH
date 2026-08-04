import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseMock, type SupabaseMock } from '../../../test/supabase-mock';

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
  return m;
}

const ROOMS = [
  { id: 1, numero: '2', numero_sort: 2, planta: '1', room_type: { nombre: 'Doble', tarifa_dia: 56, tarifa_semana: 300, tarifa_mes: 1000, capacidad: 2, moneda: 'EUR' } },
  { id: 2, numero: '10', numero_sort: 10, planta: '1', room_type: { nombre: 'Suite', tarifa_dia: 90, tarifa_semana: 500, tarifa_mes: 1800, capacidad: 4, moneda: 'EUR' } },
];

describe('availability — rango invertido (bug 9)', () => {
  beforeEach(() => vi.resetModules());

  it('rechaza el rango si la salida es anterior a la entrada', async () => {
    setMock(createSupabaseMock({ bookings: { data: [] }, rooms: { data: ROOMS } }));
    const { availability } = await import('./bookings.api');

    // Caso del reporte: entrada 10/08, salida 05/08.
    await expect(availability({
      dateFrom: '2026-08-10T14:00:00.000Z',
      dateTo: '2026-08-05T11:00:00.000Z',
    })).rejects.toThrow(/posterior/i);
  });

  it('no consulta la base con un rango invertido', async () => {
    const m = setMock(createSupabaseMock({ bookings: { data: [] }, rooms: { data: ROOMS } }));
    const { availability } = await import('./bookings.api');

    await availability({
      dateFrom: '2026-08-10T14:00:00.000Z',
      dateTo: '2026-08-05T11:00:00.000Z',
    }).catch(() => null);

    // El comportamiento anterior ofrecia TODAS las habitaciones como libres.
    expect(m.calls).toHaveLength(0);
  });

  it('rechaza tambien si entrada y salida son el mismo instante', async () => {
    setMock(createSupabaseMock({ bookings: { data: [] }, rooms: { data: ROOMS } }));
    const { availability } = await import('./bookings.api');
    const t = '2026-08-10T14:00:00.000Z';
    await expect(availability({ dateFrom: t, dateTo: t })).rejects.toThrow();
  });

  it('con un rango valido devuelve las habitaciones con su moneda', async () => {
    setMock(createSupabaseMock({ bookings: { data: [] }, rooms: { data: ROOMS } }));
    const { availability } = await import('./bookings.api');

    const rs = await availability({
      dateFrom: '2026-09-10T14:00:00.000Z',
      dateTo: '2026-09-12T11:00:00.000Z',
    });

    expect(rs).toHaveLength(2);
    // Sin moneda, el formulario pintaba todas las tarifas en USD (bug 14).
    expect(rs.every((r) => r.moneda === 'EUR')).toBe(true);
  });

  it('ordena por numero_sort para no listar 1, 10, 11, 2 (bug 17)', async () => {
    const m = setMock(createSupabaseMock({ bookings: { data: [] }, rooms: { data: ROOMS } }));
    const { availability } = await import('./bookings.api');

    await availability({
      dateFrom: '2026-09-10T14:00:00.000Z',
      dateTo: '2026-09-12T11:00:00.000Z',
    });

    const orders = m.callsOn('rooms').filter((c) => c.method === 'order');
    expect(orders[0]?.args[0]).toBe('numero_sort');
  });

  it('excluye habitaciones en mantenimiento o fuera de servicio', async () => {
    const m = setMock(createSupabaseMock({ bookings: { data: [] }, rooms: { data: ROOMS } }));
    const { availability } = await import('./bookings.api');

    await availability({
      dateFrom: '2026-09-10T14:00:00.000Z',
      dateTo: '2026-09-12T11:00:00.000Z',
    });

    const notCalls = m.callsOn('rooms').filter((c) => c.method === 'not');
    const statusFilter = notCalls.find((c) => c.args[0] === 'status');
    expect(statusFilter).toBeDefined();
    expect(String(statusFilter?.args[2])).toContain('mantenimiento');
  });

  it('filtra por capacidad segun el numero de huespedes', async () => {
    setMock(createSupabaseMock({ bookings: { data: [] }, rooms: { data: ROOMS } }));
    const { availability } = await import('./bookings.api');

    const rs = await availability({
      dateFrom: '2026-09-10T14:00:00.000Z',
      dateTo: '2026-09-12T11:00:00.000Z',
      huespedes: 4,
    });

    expect(rs.map((r) => r.numero)).toEqual(['10']);
  });
});

describe('calendarBookings — estados pintados (bug 2)', () => {
  beforeEach(() => vi.resetModules());

  it('no pinta canceladas ni no-shows por defecto', async () => {
    const m = setMock(createSupabaseMock({ bookings_with_relations: { data: [] } }));
    const { calendarBookings } = await import('./bookings.api');

    await calendarBookings('2026-09-01', '2026-09-30');

    const inCall = m.callsOn('bookings_with_relations').find((c) => c.method === 'in');
    expect(inCall).toBeDefined();
    const estados = inCall?.args[1] as string[];
    expect(estados).not.toContain('cancelada');
    expect(estados).not.toContain('no_show');
    expect(estados).toContain('confirmada');
  });

  it('permite incluirlas si se pide explicitamente', async () => {
    const m = setMock(createSupabaseMock({ bookings_with_relations: { data: [] } }));
    const { calendarBookings } = await import('./bookings.api');

    await calendarBookings('2026-09-01', '2026-09-30', { includeCancelled: true });

    expect(m.callsOn('bookings_with_relations').find((c) => c.method === 'in')).toBeUndefined();
  });
});

describe('getRefundExposure — dinero de reservas canceladas (bug 19)', () => {
  beforeEach(() => vi.resetModules());

  it('agrupa los cobros confirmados por moneda y calcula el total en base', async () => {
    setMock(createSupabaseMock({
      booking_payments: {
        data: [
          { monto: 112, moneda: 'EUR', monto_base: 121.74 },
          { monto: 38, moneda: 'VES', monto_base: 1.04 },
          { monto: 20, moneda: 'EUR', monto_base: 21.74 },
        ],
      },
    }));
    const { getRefundExposure } = await import('./bookings.api');

    const r = await getRefundExposure(64);

    expect(r.count).toBe(3);
    expect(r.total_base_usd).toBeCloseTo(144.52, 2);
    const eur = r.por_moneda.find((m) => m.moneda === 'EUR');
    expect(eur?.total).toBe(132);
  });

  it('devuelve exposicion cero si no hay cobros confirmados', async () => {
    setMock(createSupabaseMock({ booking_payments: { data: [] } }));
    const { getRefundExposure } = await import('./bookings.api');

    const r = await getRefundExposure(64);
    expect(r.count).toBe(0);
    expect(r.total_base_usd).toBe(0);
    expect(r.por_moneda).toEqual([]);
  });

  it('solo mira los pagos confirmados', async () => {
    const m = setMock(createSupabaseMock({ booking_payments: { data: [] } }));
    const { getRefundExposure } = await import('./bookings.api');

    await getRefundExposure(64);

    const statusFilter = m.callsOn('booking_payments')
      .filter((c) => c.method === 'eq')
      .find((c) => c.args[0] === 'status');
    expect(statusFilter?.args[1]).toBe('confirmed');
  });
});
