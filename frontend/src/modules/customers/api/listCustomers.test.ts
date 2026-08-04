import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseMock, type SupabaseMock } from '../../../test/supabase-mock';

vi.mock('../../../shared/lib/supabase', () => ({
  get supabase() { return globalThis.__sbMock.client; },
}));

declare global {
  // eslint-disable-next-line no-var
  var __sbMock: SupabaseMock;
}

describe('listCustomers — busqueda de huespedes (bug 7)', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.__sbMock = createSupabaseMock({ customers_with_stats: { data: [], count: 0 } });
  });

  it('busca sobre search_text, no campo por campo', async () => {
    const { listCustomers } = await import('./customers.api');
    await listCustomers({ search: 'Maria' });

    const ilikes = globalThis.__sbMock.callsOn('customers_with_stats').filter((c) => c.method === 'ilike');
    expect(ilikes.length).toBeGreaterThan(0);
    // Antes se hacia un .or() sobre nombres/apellidos/doc/email por separado,
    // asi que "TEST Maria" no encontraba nada.
    expect(ilikes.every((c) => c.args[0] === 'search_text')).toBe(true);
    expect(globalThis.__sbMock.callsOn('customers_with_stats').some((c) => c.method === 'or')).toBe(false);
  });

  it('normaliza el termino: sin tildes y en minusculas', async () => {
    const { listCustomers } = await import('./customers.api');
    await listCustomers({ search: 'MARÍA' });

    const ilike = globalThis.__sbMock.argsOf('customers_with_stats', 'ilike');
    expect(ilike?.[1]).toBe('%maria%');
  });

  it('exige todas las palabras, en cualquier orden', async () => {
    const { listCustomers } = await import('./customers.api');
    await listCustomers({ search: 'TEST Maria' });

    const ilikes = globalThis.__sbMock.callsOn('customers_with_stats').filter((c) => c.method === 'ilike');
    expect(ilikes).toHaveLength(2);
    expect(ilikes.map((c) => c.args[1])).toEqual(['%test%', '%maria%']);
  });

  it('sin termino de busqueda no aplica ningun filtro de texto', async () => {
    const { listCustomers } = await import('./customers.api');
    await listCustomers({});

    expect(globalThis.__sbMock.callsOn('customers_with_stats').some((c) => c.method === 'ilike')).toBe(false);
  });

  it('propaga el error para que la UI pueda avisar', async () => {
    globalThis.__sbMock = createSupabaseMock({
      customers_with_stats: { error: { message: 'column search_text does not exist', code: '42703' } },
    });
    const { listCustomers } = await import('./customers.api');

    // Antes el .then() sin .catch() se lo tragaba y la lista se quedaba
    // congelada con el resultado anterior.
    await expect(listCustomers({ search: 'maria' })).rejects.toBeTruthy();
  });

  it('devuelve el total para poder avisar de que hay mas resultados', async () => {
    globalThis.__sbMock = createSupabaseMock({
      customers_with_stats: { data: [{ id: 1 }, { id: 2 }], count: 137 },
    });
    const { listCustomers } = await import('./customers.api');

    const r = await listCustomers({ limit: 50 });
    expect(r.pagination.total).toBe(137);
  });
});
