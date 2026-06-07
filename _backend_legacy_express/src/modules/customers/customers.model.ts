import type { PoolClient } from 'pg';
import { pool } from '../../shared/config/db.js';
import type { CustomerRow, CustomerWithStats } from './customers.types.js';
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from './customers.validation.js';

type Exec = Pick<PoolClient, 'query'> | typeof pool;

const SELECT_WITH_STATS = `
  SELECT c.*,
         COUNT(b.id)::text                                          AS total_estancias,
         COALESCE(SUM(b.importe_pagado), 0)::text                   AS total_gastado
    FROM customers c
    LEFT JOIN bookings b
      ON b.customer_id = c.id AND b.status IN ('en_curso','finalizada')
`;

export async function list(
  filters: ListCustomersQuery,
  exec: Exec = pool,
): Promise<{ items: CustomerWithStats[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    const i = params.length;
    where.push(`(LOWER(c.nombres) LIKE $${i} OR LOWER(c.apellidos) LIKE $${i} OR LOWER(c.email) LIKE $${i} OR c.doc_numero ILIKE $${i})`);
  }
  if (filters.doc_kind) { params.push(filters.doc_kind); where.push(`c.doc_kind = $${params.length}`); }
  if (filters.accepts_marketing !== undefined) { params.push(filters.accepts_marketing); where.push(`c.accepts_marketing = $${params.length}`); }

  // Segments: filtros adicionales sobre subqueries
  if (filters.segment === 'birthdays_month') {
    where.push(`EXTRACT(MONTH FROM c.fecha_nacimiento) = EXTRACT(MONTH FROM NOW())`);
  }

  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

  // Para vip / inactivos / recientes filtramos via HAVING tras agrupar
  const having: string[] = [];
  if (filters.segment === 'vip') having.push(`COUNT(b.id) >= 3`);
  if (filters.segment === 'recientes') {
    having.push(`MAX(b.fecha_salida) > NOW() - INTERVAL '30 days'`);
  }
  if (filters.segment === 'inactivos') {
    having.push(`(MAX(b.fecha_salida) IS NULL OR MAX(b.fecha_salida) < NOW() - INTERVAL '90 days')`);
  }
  const havingSQL = having.length ? 'HAVING ' + having.join(' AND ') : '';

  const offset = (filters.page - 1) * filters.limit;

  // Total (sin paginacion)
  const countSQL = `
    SELECT COUNT(*)::int AS total FROM (
      ${SELECT_WITH_STATS}
      ${whereSQL}
      GROUP BY c.id
      ${havingSQL}
    ) sub
  `;
  const { rows: countRows } = await exec.query<{ total: number }>(countSQL, params);
  const total = countRows[0]?.total ?? 0;

  params.push(filters.limit, offset);
  const listSQL = `
    ${SELECT_WITH_STATS}
    ${whereSQL}
    GROUP BY c.id
    ${havingSQL}
    ORDER BY c.apellidos, c.nombres
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows } = await exec.query<CustomerWithStats>(listSQL, params);
  return { items: rows, total };
}

export async function findById(id: number, exec: Exec = pool): Promise<CustomerWithStats | null> {
  const { rows } = await exec.query<CustomerWithStats>(
    `${SELECT_WITH_STATS} WHERE c.id = $1 GROUP BY c.id`,
    [id],
  );
  return rows[0] ?? null;
}

export async function docExists(
  doc_kind: string,
  doc_numero: string,
  exceptId: number | null = null,
  exec: Exec = pool,
): Promise<boolean> {
  const params: unknown[] = [doc_kind, doc_numero];
  let q = `SELECT 1 FROM customers WHERE doc_kind = $1 AND doc_numero = $2`;
  if (exceptId !== null) { params.push(exceptId); q += ` AND id <> $3`; }
  q += ' LIMIT 1';
  const { rows } = await exec.query(q, params);
  return rows.length > 0;
}

export async function create(input: CreateCustomerInput, exec: Exec = pool): Promise<CustomerRow> {
  const { rows } = await exec.query<CustomerRow>(
    `INSERT INTO customers (nombres, apellidos, doc_kind, doc_numero, email, telefono,
                            fecha_nacimiento, nacionalidad, direccion, preferencias, notas, accepts_marketing)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      input.nombres, input.apellidos, input.doc_kind, input.doc_numero,
      input.email ?? null, input.telefono ?? null,
      input.fecha_nacimiento ?? null,
      input.nacionalidad ?? null,
      input.direccion ?? null,
      JSON.stringify(input.preferencias),
      input.notas ?? null,
      input.accepts_marketing,
    ],
  );
  if (!rows[0]) throw new Error('No se pudo crear customer');
  return rows[0];
}

export async function update(id: number, input: UpdateCustomerInput, exec: Exec = pool): Promise<CustomerRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const setField = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  if (input.nombres !== undefined) setField('nombres', input.nombres);
  if (input.apellidos !== undefined) setField('apellidos', input.apellidos);
  if (input.doc_kind !== undefined) setField('doc_kind', input.doc_kind);
  if (input.doc_numero !== undefined) setField('doc_numero', input.doc_numero);
  if (input.email !== undefined) setField('email', input.email);
  if (input.telefono !== undefined) setField('telefono', input.telefono);
  if (input.fecha_nacimiento !== undefined) setField('fecha_nacimiento', input.fecha_nacimiento);
  if (input.nacionalidad !== undefined) setField('nacionalidad', input.nacionalidad);
  if (input.direccion !== undefined) setField('direccion', input.direccion);
  if (input.preferencias !== undefined) setField('preferencias', JSON.stringify(input.preferencias));
  if (input.notas !== undefined) setField('notas', input.notas);
  if (input.accepts_marketing !== undefined) setField('accepts_marketing', input.accepts_marketing);
  if (input.active !== undefined) setField('active', input.active);
  if (!sets.length) {
    const { rows } = await exec.query<CustomerRow>(`SELECT * FROM customers WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }
  params.push(id);
  const { rows } = await exec.query<CustomerRow>(
    `UPDATE customers SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0] ?? null;
}

export async function softDelete(id: number, exec: Exec = pool): Promise<boolean> {
  const { rowCount } = await exec.query(`UPDATE customers SET active = false WHERE id = $1 AND active = true`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function hasActiveBookings(id: number, exec: Exec = pool): Promise<boolean> {
  const { rows } = await exec.query(
    `SELECT 1 FROM bookings WHERE customer_id = $1 AND status IN ('pendiente','confirmada','en_curso') LIMIT 1`,
    [id],
  );
  return rows.length > 0;
}

export async function timeline(id: number, exec: Exec = pool): Promise<{
  bookings: Array<{ id: number; codigo: string; fecha_entrada: Date; fecha_salida: Date; status: string; importe_total: string; room_numero: string }>;
  emails: Array<{ id: number; asunto: string; event: string; status: string; sent_at: Date | null; created_at: Date }>;
}> {
  const { rows: bookings } = await exec.query(
    `SELECT b.id, b.codigo, b.fecha_entrada, b.fecha_salida, b.status, b.importe_total, r.numero AS room_numero
       FROM bookings b JOIN rooms r ON r.id = b.room_id
      WHERE b.customer_id = $1 ORDER BY b.fecha_entrada DESC LIMIT 50`,
    [id],
  );
  const { rows: emails } = await exec.query(
    `SELECT id, asunto, event, status, sent_at, created_at
       FROM email_logs WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [id],
  );
  return { bookings: bookings as never, emails: emails as never };
}
