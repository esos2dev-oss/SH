import type { PoolClient } from 'pg';
import { pool } from '../../shared/config/db.js';
import type { LedgerEntryRow, LedgerEntryWithJoins } from './ledger.types.js';
import type { CreateLedgerInput, ListLedgerQuery, SummaryQuery } from './ledger.validation.js';

type Exec = Pick<PoolClient, 'query'> | typeof pool;

const SELECT_JOINS = `
  SELECT l.*,
         c.nombre AS category_nombre,
         c.slug   AS category_slug,
         CASE WHEN cu.id IS NOT NULL THEN cu.nombres || ' ' || cu.apellidos ELSE NULL END AS customer_nombre,
         b.codigo AS booking_codigo,
         (SELECT COUNT(*) FROM receipts r WHERE r.ledger_entry_id = l.id AND r.active = true)::text AS receipts_count
    FROM ledger_entries l
    JOIN ledger_categories c ON c.id = l.category_id
    LEFT JOIN customers cu ON cu.id = l.customer_id
    LEFT JOIN bookings b ON b.id = l.booking_id
`;

export async function list(filters: ListLedgerQuery, exec: Exec = pool): Promise<{ items: LedgerEntryWithJoins[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.type) { params.push(filters.type); where.push(`l.type = $${params.length}`); }
  if (filters.category_id) { params.push(filters.category_id); where.push(`l.category_id = $${params.length}`); }
  if (filters.dateFrom) { params.push(filters.dateFrom); where.push(`l.fecha >= $${params.length}`); }
  if (filters.dateTo) { params.push(filters.dateTo); where.push(`l.fecha <= $${params.length}`); }
  if (filters.status) { params.push(filters.status); where.push(`l.status = $${params.length}`); }
  if (filters.booking_id) { params.push(filters.booking_id); where.push(`l.booking_id = $${params.length}`); }
  if (filters.customer_id) { params.push(filters.customer_id); where.push(`l.customer_id = $${params.length}`); }
  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    const i = params.length;
    where.push(`(LOWER(l.descripcion) LIKE $${i} OR LOWER(l.codigo) LIKE $${i})`);
  }
  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const countSQL = `SELECT COUNT(*)::int AS total FROM ledger_entries l ${whereSQL}`;
  const { rows: countRows } = await exec.query<{ total: number }>(countSQL, params);
  const total = countRows[0]?.total ?? 0;

  const offset = (filters.page - 1) * filters.limit;
  params.push(filters.limit, offset);
  const sql = `${SELECT_JOINS} ${whereSQL} ORDER BY l.fecha DESC, l.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const { rows } = await exec.query<LedgerEntryWithJoins>(sql, params);
  return { items: rows, total };
}

export async function findById(id: number, exec: Exec = pool): Promise<LedgerEntryWithJoins | null> {
  const { rows } = await exec.query<LedgerEntryWithJoins>(`${SELECT_JOINS} WHERE l.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function insert(
  data: { codigo: string; input: CreateLedgerInput; registered_by: number },
  exec: Exec = pool,
): Promise<LedgerEntryRow> {
  const { rows } = await exec.query<LedgerEntryRow>(
    `INSERT INTO ledger_entries
       (codigo, type, category_id, fecha, descripcion, monto, moneda, method, booking_id, customer_id, registered_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      data.codigo, data.input.type, data.input.category_id, data.input.fecha, data.input.descripcion,
      data.input.monto, data.input.moneda, data.input.method ?? null,
      data.input.booking_id ?? null, data.input.customer_id ?? null, data.registered_by,
    ],
  );
  if (!rows[0]) throw new Error('No se pudo crear ledger_entry');
  return rows[0];
}

export async function setStatus(id: number, status: 'conciliado' | 'anulado', exec: Exec = pool): Promise<LedgerEntryRow | null> {
  const { rows } = await exec.query<LedgerEntryRow>(
    `UPDATE ledger_entries SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id],
  );
  return rows[0] ?? null;
}

export async function summary(q: SummaryQuery, exec: Exec = pool): Promise<{
  totals: { ingresos: number; egresos: number; neto: number; moneda: string };
  byCategory: Array<{ categoryId: number; nombre: string; type: string; total: number }>;
  series: Array<{ period: string; ingresos: number; egresos: number }>;
}> {
  const { rows: tot } = await exec.query<{ type: string; total: string; moneda: string }>(
    `SELECT type, SUM(monto)::text AS total, moneda
       FROM ledger_entries
      WHERE fecha BETWEEN $1 AND $2 AND status <> 'anulado'
      GROUP BY type, moneda`,
    [q.dateFrom, q.dateTo],
  );
  const totals = { ingresos: 0, egresos: 0, neto: 0, moneda: 'USD' };
  for (const r of tot) {
    const t = Number(r.total);
    if (r.type === 'ingreso') totals.ingresos += t;
    else totals.egresos += t;
    if (r.moneda) totals.moneda = r.moneda;
  }
  totals.neto = totals.ingresos - totals.egresos;

  const { rows: byCat } = await exec.query<{ category_id: number; nombre: string; type: string; total: string }>(
    `SELECT l.category_id, c.nombre, l.type, SUM(l.monto)::text AS total
       FROM ledger_entries l JOIN ledger_categories c ON c.id = l.category_id
      WHERE l.fecha BETWEEN $1 AND $2 AND l.status <> 'anulado'
      GROUP BY l.category_id, c.nombre, l.type
      ORDER BY total DESC`,
    [q.dateFrom, q.dateTo],
  );

  const trunc = q.groupBy === 'month' ? 'month' : q.groupBy === 'week' ? 'week' : 'day';
  const { rows: series } = await exec.query<{ period: string; ingresos: string; egresos: string }>(
    `SELECT to_char(date_trunc('${trunc}', fecha), 'YYYY-MM-DD') AS period,
            SUM(CASE WHEN type = 'ingreso' THEN monto ELSE 0 END)::text AS ingresos,
            SUM(CASE WHEN type = 'egreso' THEN monto ELSE 0 END)::text  AS egresos
       FROM ledger_entries
      WHERE fecha BETWEEN $1 AND $2 AND status <> 'anulado'
      GROUP BY 1 ORDER BY 1`,
    [q.dateFrom, q.dateTo],
  );

  return {
    totals,
    byCategory: byCat.map((r) => ({
      categoryId: r.category_id,
      nombre: r.nombre,
      type: r.type,
      total: Number(r.total),
    })),
    series: series.map((r) => ({ period: r.period, ingresos: Number(r.ingresos), egresos: Number(r.egresos) })),
  };
}
