// Pool unico de Postgres compartido por toda la app.
// Uso: const { rows } = await pool.query<RoomRow>('SELECT ...', [params])
// Para transacciones: usar withTransaction()

import pg from 'pg';
import { env, isProd } from './env.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: isProd ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Error inesperado en pool Postgres');
});

/**
 * Ejecuta callback dentro de una transaccion.
 * Hace BEGIN/COMMIT/ROLLBACK automatico.
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Cerrar el pool (para tests o shutdown limpio). */
export async function closePool(): Promise<void> {
  await pool.end();
}
