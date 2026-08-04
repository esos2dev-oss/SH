import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseMock, type SupabaseMock } from '../../../test/supabase-mock';

vi.mock('../../../shared/lib/supabase', () => ({
  get supabase() { return globalThis.__sbMock.client; },
}));

declare global {
  // eslint-disable-next-line no-var
  var __sbMock: SupabaseMock;
}

function rooms(estados: string[]) {
  return estados.map((status, i) => ({
    id: i + 1,
    planta: '1',
    status,
    room_type: { id: 1, nombre: 'Doble' },
  }));
}

describe('occupancy — porcentaje de ocupacion (bug 6)', () => {
  beforeEach(() => vi.resetModules());

  async function run(estados: string[]) {
    globalThis.__sbMock = createSupabaseMock({ rooms: { data: rooms(estados) } });
    const { occupancy } = await import('./rooms.api');
    return occupancy();
  }

  it('devuelve el porcentaje YA escalado 0-100, no una fraccion', async () => {
    // El caso del reporte: 2 ocupadas de 17. La UI multiplicaba otra vez por
    // 100 y mostraba "1200%". El contrato es: esto ya viene en porcentaje.
    const estados = Array(17).fill('disponible');
    estados[0] = 'ocupada';
    estados[1] = 'ocupada';

    const occ = await run(estados);

    expect(occ.total).toBe(17);
    expect(occ.byStatus.ocupada).toBe(2);
    expect(occ.occupancyRate).toBe(12);
    expect(occ.occupancyRate).toBeLessThanOrEqual(100);
  });

  it('el valor nunca pasa de 100 aunque esten todas ocupadas', async () => {
    const occ = await run(['ocupada', 'ocupada', 'ocupada']);
    expect(occ.occupancyRate).toBe(100);
  });

  it('sin habitaciones ocupadas la ocupacion es 0', async () => {
    const occ = await run(['disponible', 'limpieza', 'mantenimiento']);
    expect(occ.occupancyRate).toBe(0);
  });

  it('no divide por cero si no hay habitaciones', async () => {
    const occ = await run([]);
    expect(occ.total).toBe(0);
    expect(occ.occupancyRate).toBe(0);
  });

  it('cuenta cada estado por separado', async () => {
    const occ = await run(['ocupada', 'limpieza', 'limpieza', 'fuera_servicio', 'disponible']);
    expect(occ.byStatus).toMatchObject({
      ocupada: 1,
      limpieza: 2,
      fuera_servicio: 1,
      disponible: 1,
      mantenimiento: 0,
    });
  });

  it('la ocupacion por planta tambien viene en porcentaje', async () => {
    const occ = await run(['ocupada', 'disponible', 'disponible', 'disponible']);
    expect(occ.byPlanta[0]?.occupancyRate).toBe(25);
  });
});
