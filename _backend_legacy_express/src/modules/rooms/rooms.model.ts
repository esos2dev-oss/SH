import type { PoolClient } from 'pg';
import { pool } from '../../shared/config/db.js';
import type { RoomRow, RoomWithType, OccupancySummary, RoomStatus } from './rooms.types.js';
import type { CreateRoomInput, ListRoomsQuery, UpdateRoomInput } from './rooms.validation.js';

type Exec = Pick<PoolClient, 'query'> | typeof pool;

export async function list(filters: ListRoomsQuery, exec: Exec = pool): Promise<RoomWithType[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.status) { params.push(filters.status); where.push(`r.status = $${params.length}`); }
  if (filters.room_type_id) { params.push(filters.room_type_id); where.push(`r.room_type_id = $${params.length}`); }
  if (filters.planta) { params.push(filters.planta); where.push(`r.planta = $${params.length}`); }
  if (filters.active !== undefined) { params.push(filters.active); where.push(`r.active = $${params.length}`); }
  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    where.push(`(LOWER(r.numero) LIKE $${params.length} OR LOWER(rt.nombre) LIKE $${params.length})`);
  }
  const sql = `
    SELECT r.*,
           rt.nombre AS room_type_nombre,
           rt.slug   AS room_type_slug,
           rt.tarifa_dia,
           rt.capacidad
      FROM rooms r
      JOIN room_types rt ON rt.id = r.room_type_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY r.planta NULLS FIRST, r.numero ASC
  `;
  const { rows } = await exec.query<RoomWithType>(sql, params);
  return rows;
}

export async function findById(id: number, exec: Exec = pool): Promise<RoomWithType | null> {
  const { rows } = await exec.query<RoomWithType>(
    `SELECT r.*, rt.nombre AS room_type_nombre, rt.slug AS room_type_slug,
            rt.tarifa_dia, rt.capacidad
       FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
      WHERE r.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function numeroExists(numero: string, exceptId: number | null = null, exec: Exec = pool): Promise<boolean> {
  const params: unknown[] = [numero];
  let q = `SELECT 1 FROM rooms WHERE numero = $1`;
  if (exceptId !== null) { params.push(exceptId); q += ` AND id <> $2`; }
  q += ' LIMIT 1';
  const { rows } = await exec.query(q, params);
  return rows.length > 0;
}

export async function create(input: CreateRoomInput, exec: Exec = pool): Promise<RoomRow> {
  const { rows } = await exec.query<RoomRow>(
    `INSERT INTO rooms (numero, room_type_id, planta, status, notas, photo_url)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [input.numero, input.room_type_id, input.planta ?? null, input.status, input.notas ?? null, input.photo_url ?? null],
  );
  if (!rows[0]) throw new Error('No se pudo crear room');
  return rows[0];
}

export async function update(id: number, input: UpdateRoomInput, exec: Exec = pool): Promise<RoomRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const setField = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  if (input.numero !== undefined) setField('numero', input.numero);
  if (input.room_type_id !== undefined) setField('room_type_id', input.room_type_id);
  if (input.planta !== undefined) setField('planta', input.planta);
  if (input.status !== undefined) setField('status', input.status);
  if (input.notas !== undefined) setField('notas', input.notas);
  if (input.photo_url !== undefined) setField('photo_url', input.photo_url);
  if (input.active !== undefined) setField('active', input.active);
  if (!sets.length) {
    const { rows } = await exec.query<RoomRow>(`SELECT * FROM rooms WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }
  params.push(id);
  const { rows } = await exec.query<RoomRow>(
    `UPDATE rooms SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0] ?? null;
}

export async function updateStatus(id: number, status: RoomStatus, notas: string | null, exec: Exec = pool): Promise<RoomRow | null> {
  const { rows } = await exec.query<RoomRow>(
    `UPDATE rooms SET status = $1, notas = COALESCE($2, notas) WHERE id = $3 RETURNING *`,
    [status, notas, id],
  );
  return rows[0] ?? null;
}

export async function softDelete(id: number, exec: Exec = pool): Promise<boolean> {
  const { rowCount } = await exec.query(
    `UPDATE rooms SET active = false WHERE id = $1 AND active = true`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

export async function hasActiveBookings(id: number, exec: Exec = pool): Promise<boolean> {
  const { rows } = await exec.query(
    `SELECT 1 FROM bookings WHERE room_id = $1 AND status IN ('pendiente','confirmada','en_curso') LIMIT 1`,
    [id],
  );
  return rows.length > 0;
}

export async function occupancySummary(exec: Exec = pool): Promise<OccupancySummary> {
  const { rows: byStatusRows } = await exec.query<{ status: RoomStatus; total: string }>(
    `SELECT status, COUNT(*)::text AS total FROM rooms WHERE active = true GROUP BY status`,
  );
  const byStatus = {
    disponible: 0, ocupada: 0, limpieza: 0, mantenimiento: 0, fuera_servicio: 0,
  };
  let total = 0;
  for (const r of byStatusRows) {
    byStatus[r.status] = Number(r.total);
    total += Number(r.total);
  }

  const { rows: plantaRows } = await exec.query<{ planta: string | null; total: string; ocupada: string }>(
    `SELECT planta,
            COUNT(*)::text AS total,
            SUM(CASE WHEN status = 'ocupada' THEN 1 ELSE 0 END)::text AS ocupada
       FROM rooms WHERE active = true GROUP BY planta ORDER BY planta NULLS FIRST`,
  );

  const { rows: rtRows } = await exec.query<{ room_type_id: number; nombre: string; total: string; ocupada: string }>(
    `SELECT r.room_type_id, rt.nombre,
            COUNT(*)::text AS total,
            SUM(CASE WHEN r.status = 'ocupada' THEN 1 ELSE 0 END)::text AS ocupada
       FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
      WHERE r.active = true
      GROUP BY r.room_type_id, rt.nombre
      ORDER BY rt.nombre`,
  );

  return {
    total,
    byStatus,
    occupancyRate: total > 0 ? byStatus.ocupada / total : 0,
    byPlanta: plantaRows.map((r) => {
      const t = Number(r.total);
      const o = Number(r.ocupada);
      return { planta: r.planta, total: t, ocupada: o, occupancyRate: t > 0 ? o / t : 0 };
    }),
    byRoomType: rtRows.map((r) => ({
      roomTypeId: r.room_type_id,
      nombre: r.nombre,
      total: Number(r.total),
      ocupada: Number(r.ocupada),
    })),
  };
}
