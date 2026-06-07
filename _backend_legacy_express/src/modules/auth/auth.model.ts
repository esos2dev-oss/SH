// Queries SQL puras del modulo auth.

import type { PoolClient } from 'pg';
import { pool } from '../../shared/config/db.js';
import type { UserRow, UserSessionRow } from './auth.types.js';

type Exec = Pick<PoolClient, 'query'> | typeof pool;

export async function findUserByEmail(email: string, exec: Exec = pool): Promise<UserRow | null> {
  const { rows } = await exec.query<UserRow>(
    `SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: number, exec: Exec = pool): Promise<UserRow | null> {
  const { rows } = await exec.query<UserRow>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export async function findUserByPasswordToken(token: string, exec: Exec = pool): Promise<UserRow | null> {
  const { rows } = await exec.query<UserRow>(
    `SELECT * FROM users
       WHERE set_password_token = $1
         AND set_password_expires > NOW()
         AND active = true
       LIMIT 1`,
    [token],
  );
  return rows[0] ?? null;
}

export async function updateLastLogin(userId: number, exec: Exec = pool): Promise<void> {
  await exec.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);
}

export async function updatePassword(
  userId: number,
  passwordHash: string,
  exec: Exec = pool,
): Promise<void> {
  await exec.query(
    `UPDATE users
        SET password_hash = $1,
            set_password_token = NULL,
            set_password_expires = NULL,
            updated_at = NOW()
      WHERE id = $2`,
    [passwordHash, userId],
  );
}

export async function setPasswordToken(
  userId: number,
  token: string,
  expiresAt: Date,
  exec: Exec = pool,
): Promise<void> {
  await exec.query(
    `UPDATE users SET set_password_token = $1, set_password_expires = $2, updated_at = NOW() WHERE id = $3`,
    [token, expiresAt, userId],
  );
}

// --- Sessions (refresh tokens) ---

export async function insertSession(
  data: {
    userId: number;
    refreshTokenHash: string;
    ip: string | null;
    userAgent: string | null;
    expiresAt: Date;
  },
  exec: Exec = pool,
): Promise<UserSessionRow> {
  const { rows } = await exec.query<UserSessionRow>(
    `INSERT INTO user_sessions (user_id, refresh_token_hash, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.userId, data.refreshTokenHash, data.ip, data.userAgent, data.expiresAt],
  );
  if (!rows[0]) throw new Error('No se pudo crear la sesion');
  return rows[0];
}

export async function findActiveSessionByHash(
  refreshTokenHash: string,
  exec: Exec = pool,
): Promise<UserSessionRow | null> {
  const { rows } = await exec.query<UserSessionRow>(
    `SELECT * FROM user_sessions
       WHERE refresh_token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
    [refreshTokenHash],
  );
  return rows[0] ?? null;
}

export async function findSessionById(id: number, exec: Exec = pool): Promise<UserSessionRow | null> {
  const { rows } = await exec.query<UserSessionRow>(
    `SELECT * FROM user_sessions WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function revokeSession(id: number, exec: Exec = pool): Promise<void> {
  await exec.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`, [
    id,
  ]);
}

export async function revokeAllUserSessions(userId: number, exec: Exec = pool): Promise<void> {
  await exec.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [
    userId,
  ]);
}

export async function rotateSession(
  oldId: number,
  data: {
    userId: number;
    refreshTokenHash: string;
    ip: string | null;
    userAgent: string | null;
    expiresAt: Date;
  },
  exec: Exec = pool,
): Promise<UserSessionRow> {
  await revokeSession(oldId, exec);
  return insertSession(data, exec);
}
