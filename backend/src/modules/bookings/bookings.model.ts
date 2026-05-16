import type { PoolClient } from 'pg';
import { pool } from '../../shared/config/db.js';
import type {
  BookingRow,
  BookingWithJoins,
  BookingStatus,
  BookingPaymentRow,
} from './bookings.types.js';
import type { ListBookingsQuery, CalendarQuery } from './bookings.validation.js';

type Exec = Pick<PoolClient, 'query'> | typeof pool;

const SELECT_JOINS = `
  SELECT b.*,
         c.nombres   AS customer_nombres,
         c.apellidos AS customer_apellidos,
         c.email     AS customer_email,
         r.numero    AS room_numero,
         r.planta    AS room_planta,
         rt.nombre   AS room_type_nombre
    FROM bookings b
    JOIN customers  c  ON c.id = b.customer_id
    JOIN rooms      r  ON r.id = b.room_id
    JOIN room_types rt ON rt.id = r.room_type_id
`;

export async function list(filters: ListBookingsQuery, exec: Exec = pool): Promise<{ items: BookingWithJoins[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.status) { params.push(filters.status); where.push(`b.status = $${params.length}`); }
  if (filters.customer_id) { params.push(filters.customer_id); where.push(`b.customer_id = $${params.length}`); }
  if (filters.room_id) { params.push(filters.room_id); where.push(`b.room_id = $${params.length}`); }
  if (filters.period) { params.push(filters.period); where.push(`b.period = $${params.length}`); }
  if (filters.dateFrom) { params.push(filters.dateFrom); where.push(`b.fecha_entrada >= $${params.length}`); }
  if (filters.dateTo) { params.push(filters.dateTo); where.push(`b.fecha_salida <= $${params.length}`); }
  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    const i = params.length;
    where.push(`(LOWER(b.codigo) LIKE $${i} OR LOWER(c.nombres) LIKE $${i} OR LOWER(c.apellidos) LIKE $${i} OR LOWER(r.numero) LIKE $${i})`);
  }
  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const countSQL = `
    SELECT COUNT(*)::int AS total
      FROM bookings b
      JOIN customers c ON c.id = b.customer_id
      JOIN rooms r ON r.id = b.room_id
     ${whereSQL}
  `;
  const { rows: countRows } = await exec.query<{ total: number }>(countSQL, params);
  const total = countRows[0]?.total ?? 0;

  const offset = (filters.page - 1) * filters.limit;
  params.push(filters.limit, offset);
  const sql = `
    ${SELECT_JOINS}
    ${whereSQL}
    ORDER BY b.fecha_entrada DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows } = await exec.query<BookingWithJoins>(sql, params);
  return { items: rows, total };
}

export async function findById(id: number, exec: Exec = pool): Promise<BookingWithJoins | null> {
  const { rows } = await exec.query<BookingWithJoins>(`${SELECT_JOINS} WHERE b.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function calendar(q: CalendarQuery, exec: Exec = pool): Promise<BookingWithJoins[]> {
  const { rows } = await exec.query<BookingWithJoins>(
    `${SELECT_JOINS}
      WHERE b.status NOT IN ('cancelada','no_show')
        AND b.fecha_salida >= $1::date
        AND b.fecha_entrada <= $2::date + INTERVAL '1 day'
      ORDER BY b.fecha_entrada`,
    [q.dateFrom, q.dateTo],
  );
  return rows;
}

export async function checkOverlap(
  roomId: number,
  fechaEntrada: string,
  fechaSalida: string,
  excludeId: number | null = null,
  exec: Exec = pool,
): Promise<boolean> {
  const params: unknown[] = [roomId, fechaEntrada, fechaSalida];
  let q = `
    SELECT 1 FROM bookings
     WHERE room_id = $1
       AND status IN ('pendiente','confirmada','en_curso')
       AND tstzrange(fecha_entrada, fecha_salida, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
  `;
  if (excludeId !== null) { params.push(excludeId); q += ` AND id <> $4`; }
  q += ' LIMIT 1';
  const { rows } = await exec.query(q, params);
  return rows.length > 0;
}

export interface InsertBookingData {
  codigo: string;
  customer_id: number;
  room_id: number;
  period: string;
  fecha_entrada: string;
  fecha_salida: string;
  huespedes: number;
  tarifa_aplicada: number;
  descuento_pct: number;
  descuento_monto: number;
  importe_total: number;
  moneda: string;
  notas: string | null;
  created_by: number;
}

export async function insert(data: InsertBookingData, exec: Exec = pool): Promise<BookingRow> {
  const { rows } = await exec.query<BookingRow>(
    `INSERT INTO bookings
       (codigo, customer_id, room_id, period, fecha_entrada, fecha_salida, huespedes,
        tarifa_aplicada, descuento_pct, descuento_monto, importe_total, moneda, notas, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      data.codigo, data.customer_id, data.room_id, data.period,
      data.fecha_entrada, data.fecha_salida, data.huespedes,
      data.tarifa_aplicada, data.descuento_pct, data.descuento_monto, data.importe_total,
      data.moneda, data.notas, data.created_by,
    ],
  );
  if (!rows[0]) throw new Error('No se pudo crear booking');
  return rows[0];
}

export async function updateBasic(id: number, fields: Partial<{ huespedes: number; notas: string | null }>, exec: Exec = pool): Promise<BookingRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.huespedes !== undefined) { params.push(fields.huespedes); sets.push(`huespedes = $${params.length}`); }
  if (fields.notas !== undefined) { params.push(fields.notas); sets.push(`notas = $${params.length}`); }
  if (!sets.length) {
    const { rows } = await exec.query<BookingRow>(`SELECT * FROM bookings WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }
  params.push(id);
  const { rows } = await exec.query<BookingRow>(
    `UPDATE bookings SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0] ?? null;
}

export async function updateStatus(
  id: number,
  status: BookingStatus,
  extras: { cancelled_reason?: string | null } = {},
  exec: Exec = pool,
): Promise<BookingRow | null> {
  const { rows } = await exec.query<BookingRow>(
    `UPDATE bookings
        SET status = $1,
            cancelled_at = CASE WHEN $1 = 'cancelada' THEN NOW() ELSE cancelled_at END,
            cancelled_reason = COALESCE($2, cancelled_reason)
      WHERE id = $3 RETURNING *`,
    [status, extras.cancelled_reason ?? null, id],
  );
  return rows[0] ?? null;
}

// Payments — solo listado para retrocompat del endpoint legacy.
// El resto (insert, recompute, etc.) vive en el modulo payments.
export async function listPayments(bookingId: number, exec: Exec = pool): Promise<BookingPaymentRow[]> {
  const { rows } = await exec.query<BookingPaymentRow>(
    `SELECT * FROM booking_payments WHERE booking_id = $1 ORDER BY pagado_at DESC`,
    [bookingId],
  );
  return rows;
}
