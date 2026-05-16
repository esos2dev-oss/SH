import type { PoolClient } from 'pg';
import { pool } from '../../shared/config/db.js';
import type { RoomTypeRow } from './room-types.types.js';
import type {
  CreateRoomTypeInput,
  ListRoomTypesQuery,
  UpdateRoomTypeInput,
} from './room-types.validation.js';

type Exec = Pick<PoolClient, 'query'> | typeof pool;

export async function list(filters: ListRoomTypesQuery, exec: Exec = pool): Promise<RoomTypeRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.active !== undefined) {
    params.push(filters.active);
    where.push(`active = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    where.push(`(LOWER(nombre) LIKE $${params.length} OR LOWER(slug) LIKE $${params.length})`);
  }
  const sql = `SELECT * FROM room_types ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY nombre ASC`;
  const { rows } = await exec.query<RoomTypeRow>(sql, params);
  return rows;
}

export async function findById(id: number, exec: Exec = pool): Promise<RoomTypeRow | null> {
  const { rows } = await exec.query<RoomTypeRow>(`SELECT * FROM room_types WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function slugExists(slug: string, exceptId: number | null = null, exec: Exec = pool): Promise<boolean> {
  const params: unknown[] = [slug];
  let q = `SELECT 1 FROM room_types WHERE slug = $1`;
  if (exceptId !== null) {
    params.push(exceptId);
    q += ` AND id <> $2`;
  }
  q += ' LIMIT 1';
  const { rows } = await exec.query(q, params);
  return rows.length > 0;
}

export async function create(input: CreateRoomTypeInput, exec: Exec = pool): Promise<RoomTypeRow> {
  const { rows } = await exec.query<RoomTypeRow>(
    `INSERT INTO room_types (nombre, slug, descripcion, capacidad, tarifa_dia, tarifa_semana, tarifa_mes, moneda, amenities)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.nombre,
      input.slug,
      input.descripcion ?? null,
      input.capacidad,
      input.tarifa_dia,
      input.tarifa_semana ?? null,
      input.tarifa_mes ?? null,
      input.moneda,
      JSON.stringify(input.amenities),
    ],
  );
  if (!rows[0]) throw new Error('No se pudo crear room_type');
  return rows[0];
}

export async function update(id: number, input: UpdateRoomTypeInput, exec: Exec = pool): Promise<RoomTypeRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const setField = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (input.nombre !== undefined) setField('nombre', input.nombre);
  if (input.slug !== undefined) setField('slug', input.slug);
  if (input.descripcion !== undefined) setField('descripcion', input.descripcion);
  if (input.capacidad !== undefined) setField('capacidad', input.capacidad);
  if (input.tarifa_dia !== undefined) setField('tarifa_dia', input.tarifa_dia);
  if (input.tarifa_semana !== undefined) setField('tarifa_semana', input.tarifa_semana);
  if (input.tarifa_mes !== undefined) setField('tarifa_mes', input.tarifa_mes);
  if (input.moneda !== undefined) setField('moneda', input.moneda);
  if (input.amenities !== undefined) setField('amenities', JSON.stringify(input.amenities));
  if (input.active !== undefined) setField('active', input.active);
  if (!sets.length) return findById(id, exec);

  params.push(id);
  const { rows } = await exec.query<RoomTypeRow>(
    `UPDATE room_types SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0] ?? null;
}

export async function softDelete(id: number, exec: Exec = pool): Promise<boolean> {
  const { rowCount } = await exec.query(
    `UPDATE room_types SET active = false WHERE id = $1 AND active = true`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

export async function hasRooms(id: number, exec: Exec = pool): Promise<boolean> {
  const { rows } = await exec.query(`SELECT 1 FROM rooms WHERE room_type_id = $1 LIMIT 1`, [id]);
  return rows.length > 0;
}
