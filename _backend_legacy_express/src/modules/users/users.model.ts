import type { PoolClient } from 'pg';
import { pool } from '../../shared/config/db.js';
import type { UserRow } from '../auth/auth.types.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.validation.js';

type Exec = Pick<PoolClient, 'query'> | typeof pool;

export async function listUsers(filters: ListUsersQuery, exec: Exec = pool): Promise<{ items: UserRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.role) {
    params.push(filters.role);
    conditions.push(`role = $${params.length}`);
  }
  if (filters.active !== undefined) {
    params.push(filters.active);
    conditions.push(`active = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    conditions.push(`(LOWER(nombre) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const offset = (filters.page - 1) * filters.limit;

  const countQ = `SELECT COUNT(*)::int AS total FROM users ${where}`;
  const { rows: countRows } = await exec.query<{ total: number }>(countQ, params);
  const total = countRows[0]?.total ?? 0;

  params.push(filters.limit);
  params.push(offset);
  const listQ = `
    SELECT * FROM users
    ${where}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows } = await exec.query<UserRow>(listQ, params);
  return { items: rows, total };
}

export async function findById(id: number, exec: Exec = pool): Promise<UserRow | null> {
  const { rows } = await exec.query<UserRow>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export async function emailExists(email: string, exceptId: number | null = null, exec: Exec = pool): Promise<boolean> {
  const params: unknown[] = [email.toLowerCase()];
  let q = `SELECT 1 FROM users WHERE LOWER(email) = $1`;
  if (exceptId !== null) {
    params.push(exceptId);
    q += ` AND id <> $2`;
  }
  q += ' LIMIT 1';
  const { rows } = await exec.query(q, params);
  return rows.length > 0;
}

export async function create(input: CreateUserInput, exec: Exec = pool): Promise<UserRow> {
  // password_hash temporal, se sobreescribira con set-password
  const tempHash = '$2b$12$placeholderxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const { rows } = await exec.query<UserRow>(
    `INSERT INTO users (nombre, email, password_hash, role, active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING *`,
    [input.nombre, input.email, tempHash, input.role],
  );
  if (!rows[0]) throw new Error('No se pudo crear usuario');
  return rows[0];
}

export async function update(id: number, input: UpdateUserInput, exec: Exec = pool): Promise<UserRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.nombre !== undefined) {
    params.push(input.nombre);
    sets.push(`nombre = $${params.length}`);
  }
  if (input.email !== undefined) {
    params.push(input.email);
    sets.push(`email = $${params.length}`);
  }
  if (input.role !== undefined) {
    params.push(input.role);
    sets.push(`role = $${params.length}`);
  }
  if (input.active !== undefined) {
    params.push(input.active);
    sets.push(`active = $${params.length}`);
  }
  if (!sets.length) return findById(id, exec);
  sets.push(`updated_at = NOW()`);

  params.push(id);
  const { rows } = await exec.query<UserRow>(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0] ?? null;
}

export async function softDelete(id: number, exec: Exec = pool): Promise<boolean> {
  const { rowCount } = await exec.query(
    `UPDATE users SET active = false, updated_at = NOW() WHERE id = $1 AND active = true`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}
