import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseMock, type SupabaseMock } from '../../../test/supabase-mock';

vi.mock('../../../shared/lib/supabase', () => ({
  get supabase() { return globalThis.__sbMock.client; },
}));

declare global {
  // eslint-disable-next-line no-var
  var __sbMock: SupabaseMock;
}

const ENTRADA = {
  id: 5,
  user_id: 'uuid-recepcion-1',
  user_nombre: 'Ana Perez',
  user_email: 'ana@hotel.com',
  user_role: 'recepcion',
  action: 'status_change',
  entity: 'bookings',
  entity_id: '64',
  before: { status: 'confirmada' },
  after: { status: 'en_curso' },
  ip: null,
  user_agent: null,
  created_at: '2026-07-29T12:00:00+00:00',
};

describe('listAudit — quien hizo que (bug 8)', () => {
  beforeEach(() => vi.resetModules());

  it('lee de la vista que hace el join con profiles, no de audit_log a pelo', async () => {
    globalThis.__sbMock = createSupabaseMock({ audit_log_with_user: { data: [ENTRADA], count: 1 } });
    const { listAudit } = await import('./audit.api');

    await listAudit();

    // audit_log a secas no trae el nombre; por eso todo salia "— sin usuario —".
    expect(globalThis.__sbMock.callsOn('audit_log_with_user').length).toBeGreaterThan(0);
    expect(globalThis.__sbMock.callsOn('audit_log').length).toBe(0);
  });

  it('devuelve el nombre real del usuario en vez de null hardcodeado', async () => {
    globalThis.__sbMock = createSupabaseMock({ audit_log_with_user: { data: [ENTRADA], count: 1 } });
    const { listAudit } = await import('./audit.api');

    const r = await listAudit();

    expect(r.data[0]?.user_nombre).toBe('Ana Perez');
    expect(r.data[0]?.user_role).toBe('recepcion');
  });

  it('conserva el diff before/after', async () => {
    globalThis.__sbMock = createSupabaseMock({ audit_log_with_user: { data: [ENTRADA], count: 1 } });
    const { listAudit } = await import('./audit.api');

    const r = await listAudit();

    expect(r.data[0]?.before).toEqual({ status: 'confirmada' });
    expect(r.data[0]?.after).toEqual({ status: 'en_curso' });
  });

  it('aplica los filtros que recibe', async () => {
    globalThis.__sbMock = createSupabaseMock({ audit_log_with_user: { data: [], count: 0 } });
    const { listAudit } = await import('./audit.api');

    await listAudit({ action: 'create', entity: 'bookings', user_id: 'uuid-1' });

    const eqs = globalThis.__sbMock.callsOn('audit_log_with_user').filter((c) => c.method === 'eq');
    const campos = eqs.map((c) => c.args[0]);
    expect(campos).toContain('action');
    expect(campos).toContain('entity');
    expect(campos).toContain('user_id');
  });

  it('propaga el error en vez de tragarselo', async () => {
    globalThis.__sbMock = createSupabaseMock({
      audit_log_with_user: { error: { message: 'permission denied for view', code: '42501' } },
    });
    const { listAudit } = await import('./audit.api');

    await expect(listAudit()).rejects.toBeTruthy();
  });
});
