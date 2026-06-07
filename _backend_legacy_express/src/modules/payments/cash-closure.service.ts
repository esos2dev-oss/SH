// Cierre de caja por turno. Agrega los pagos confirmados del rango y del usuario,
// genera totales por metodo y moneda, y deja un registro firmable.

import { withTransaction, pool } from '../../shared/config/db.js';
import { Errors } from '../../shared/utils/app-error.js';
import { logAudit } from '../../shared/services/audit.service.js';
import { nextCode } from '../../shared/services/code-generator.service.js';

export interface CashClosureTotals {
  by_method: Record<string, { count: number; total_moneda: Record<string, number> }>;
  total_confirmados: Record<string, number>;
  total_por_confirmar: Record<string, number>;
  total_count: number;
}

export interface CashClosurePublic {
  id: number;
  codigo: string;
  user_id: number;
  user_name: string | null;
  opened_at: string;
  closed_at: string;
  totals: CashClosureTotals;
  pending_count: number;
  notas: string | null;
  signature_url: string | null;
  created_at: string;
}

function emptyTotals(): CashClosureTotals {
  return { by_method: {}, total_confirmados: {}, total_por_confirmar: {}, total_count: 0 };
}

function roundMap(map: Record<string, number>) {
  for (const k of Object.keys(map)) {
    map[k] = Math.round((map[k] ?? 0) * 100) / 100;
  }
}

/**
 * Agrega los pagos registrados por `userId` entre `openedAt` y `closedAt` y
 * devuelve totales por metodo y moneda + cuentas de confirmados vs por confirmar.
 */
export async function preview(userId: number, openedAt: string, closedAt: string): Promise<CashClosureTotals> {
  const { rows } = await pool.query<{ method: string; moneda: string; status: string; monto: string; count: number }>(
    `SELECT method, moneda, status, SUM(monto)::text AS monto, COUNT(*)::int AS count
       FROM booking_payments
      WHERE registered_by = $1
        AND pagado_at >= $2::timestamptz
        AND pagado_at <= $3::timestamptz
        AND status <> 'rejected'
      GROUP BY method, moneda, status`,
    [userId, openedAt, closedAt],
  );

  const out = emptyTotals();
  for (const r of rows) {
    out.total_count += r.count;
    if (r.status === 'confirmed') {
      out.total_confirmados[r.moneda] = (out.total_confirmados[r.moneda] ?? 0) + Number(r.monto);
      if (!out.by_method[r.method]) out.by_method[r.method] = { count: 0, total_moneda: {} };
      const bm = out.by_method[r.method]!;
      bm.count += r.count;
      bm.total_moneda[r.moneda] = (bm.total_moneda[r.moneda] ?? 0) + Number(r.monto);
    } else if (r.status === 'pending_confirmation') {
      out.total_por_confirmar[r.moneda] = (out.total_por_confirmar[r.moneda] ?? 0) + Number(r.monto);
    }
  }
  roundMap(out.total_confirmados);
  roundMap(out.total_por_confirmar);
  for (const m of Object.values(out.by_method)) roundMap(m.total_moneda);

  return out;
}

interface CommitInput {
  user_id: number;
  opened_at: string;
  closed_at: string;
  notas?: string | null;
  signature_url?: string | null;
}

export async function commit(input: CommitInput, actorId: number): Promise<CashClosurePublic> {
  const opened = new Date(input.opened_at);
  const closed = new Date(input.closed_at);
  if (Number.isNaN(opened.getTime())) throw Errors.validation('opened_at invalido');
  if (Number.isNaN(closed.getTime())) throw Errors.validation('closed_at invalido');
  if (closed.getTime() < opened.getTime()) throw Errors.validation('closed_at no puede ser anterior a opened_at');

  return withTransaction(async (client) => {
    const totals = await preview(input.user_id, input.opened_at, input.closed_at);
    const confirmedCount = Object.values(totals.by_method).reduce((acc, m) => acc + m.count, 0);
    const pendingCount = totals.total_count - confirmedCount;

    const codigo = await nextCode('CC', closed.getFullYear(), client);
    const { rows } = await client.query<{ id: number; created_at: Date }>(
      `INSERT INTO cash_closures (codigo, user_id, opened_at, closed_at, totals, pending_count, notas, signature_url)
       VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5::jsonb, $6, $7, $8)
       RETURNING id, created_at`,
      [
        codigo, input.user_id, input.opened_at, input.closed_at,
        JSON.stringify(totals), pendingCount, input.notas ?? null, input.signature_url ?? null,
      ],
    );

    await logAudit({
      userId: actorId,
      action: 'create',
      entity: 'cash_closures',
      entityId: rows[0]!.id,
      after: { codigo, user_id: input.user_id, total_count: totals.total_count, pending_count: pendingCount },
    }, client);

    const { rows: uRows } = await client.query<{ nombre: string | null }>(`SELECT nombre FROM users WHERE id = $1`, [input.user_id]);

    return {
      id: rows[0]!.id,
      codigo,
      user_id: input.user_id,
      user_name: uRows[0]?.nombre ?? null,
      opened_at: opened.toISOString(),
      closed_at: closed.toISOString(),
      totals,
      pending_count: pendingCount,
      notas: input.notas ?? null,
      signature_url: input.signature_url ?? null,
      created_at: rows[0]!.created_at.toISOString(),
    };
  });
}

interface ListFilters {
  user_id?: number;
  limit?: number;
}

interface ClosureRow {
  id: number; codigo: string; user_id: number; user_name: string | null;
  opened_at: Date; closed_at: Date; totals: CashClosureTotals;
  pending_count: number; notas: string | null; signature_url: string | null; created_at: Date;
}

function toPublic(r: ClosureRow): CashClosurePublic {
  return {
    id: r.id,
    codigo: r.codigo,
    user_id: r.user_id,
    user_name: r.user_name,
    opened_at: r.opened_at.toISOString(),
    closed_at: r.closed_at.toISOString(),
    totals: r.totals,
    pending_count: r.pending_count,
    notas: r.notas,
    signature_url: r.signature_url,
    created_at: r.created_at.toISOString(),
  };
}

export async function list(filters: ListFilters): Promise<CashClosurePublic[]> {
  const params: unknown[] = [];
  let where = '';
  if (filters.user_id) {
    params.push(filters.user_id);
    where = `WHERE c.user_id = $${params.length}`;
  }
  const limit = filters.limit ?? 100;
  params.push(limit);
  const { rows } = await pool.query<ClosureRow>(
    `SELECT c.id, c.codigo, c.user_id, u.nombre AS user_name, c.opened_at, c.closed_at, c.totals, c.pending_count, c.notas, c.signature_url, c.created_at
       FROM cash_closures c
       LEFT JOIN users u ON u.id = c.user_id
      ${where}
      ORDER BY c.closed_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.map(toPublic);
}

export async function getById(id: number): Promise<CashClosurePublic | null> {
  const { rows } = await pool.query<ClosureRow>(
    `SELECT c.id, c.codigo, c.user_id, u.nombre AS user_name, c.opened_at, c.closed_at, c.totals, c.pending_count, c.notas, c.signature_url, c.created_at
       FROM cash_closures c
       LEFT JOIN users u ON u.id = c.user_id
      WHERE c.id = $1`,
    [id],
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

/** Retorna la fecha del ultimo cierre del usuario, o null si nunca cerro. */
export async function lastClosure(userId: number): Promise<string | null> {
  const { rows } = await pool.query<{ closed_at: Date }>(
    `SELECT closed_at FROM cash_closures WHERE user_id = $1 ORDER BY closed_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0] ? rows[0].closed_at.toISOString() : null;
}
