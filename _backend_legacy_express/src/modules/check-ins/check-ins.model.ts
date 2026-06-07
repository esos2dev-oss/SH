import type { PoolClient } from 'pg';
import { pool } from '../../shared/config/db.js';
import type { CheckInRow } from './check-ins.types.js';

type Exec = Pick<PoolClient, 'query'> | typeof pool;

export async function findByBookingId(bookingId: number, exec: Exec = pool): Promise<CheckInRow | null> {
  const { rows } = await exec.query<CheckInRow>(`SELECT * FROM check_ins WHERE booking_id = $1`, [bookingId]);
  return rows[0] ?? null;
}

export async function insert(
  data: {
    booking_id: number;
    documento_url: string | null;
    firma_url: string | null;
    huespedes_acompaniantes: Array<Record<string, unknown>>;
    observaciones: string | null;
    registered_by: number;
  },
  exec: Exec = pool,
): Promise<CheckInRow> {
  const { rows } = await exec.query<CheckInRow>(
    `INSERT INTO check_ins
       (booking_id, documento_url, firma_url, huespedes_acompaniantes, observaciones, registered_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.booking_id, data.documento_url, data.firma_url,
      JSON.stringify(data.huespedes_acompaniantes),
      data.observaciones, data.registered_by,
    ],
  );
  if (!rows[0]) throw new Error('No se pudo crear check_in');
  return rows[0];
}

export async function checkout(
  bookingId: number,
  data: { checked_out_by: number; observaciones?: string | null },
  exec: Exec = pool,
): Promise<CheckInRow | null> {
  const { rows } = await exec.query<CheckInRow>(
    `UPDATE check_ins
        SET hora_salida = NOW(),
            checked_out_by = $1,
            observaciones = COALESCE($2, observaciones)
      WHERE booking_id = $3
      RETURNING *`,
    [data.checked_out_by, data.observaciones ?? null, bookingId],
  );
  return rows[0] ?? null;
}
