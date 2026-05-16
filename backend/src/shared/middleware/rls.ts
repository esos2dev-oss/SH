// Middleware RLS: setea variables de sesion Postgres (app.current_user_*) por request.
// IMPORTANTE: requiere usar pool.connect() y soltar el client al final del request.
// Para simplicidad de MVP, se aplica solo a rutas que lo necesiten via withRlsClient().
//
// En el patron actual SET LOCAL solo dura la transaccion. Para RLS efectivo en queries
// fuera de transaccion, las queries criticas deben envolverse con withTransaction() o usar
// pool.connect() + SET y NO release hasta terminar.
//
// Este modulo expone helper para usar dentro de services cuando ejecutas multiples queries.

import type { PoolClient } from 'pg';
import { pool } from '../config/db.js';
import type { Role } from '../types/auth.js';

export interface RlsContext {
  userId: number;
  role: Role;
}

/**
 * Ejecuta callback con un cliente de pool en el que se han seteado variables de sesion para RLS.
 * Liberar el client al terminar via release.
 */
export async function withRlsClient<T>(
  ctx: RlsContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT set_config($1, $2, true), set_config($3, $4, true)', [
      'app.current_user_id',
      String(ctx.userId),
      'app.current_user_role',
      ctx.role,
    ]);
    return await fn(client);
  } finally {
    client.release();
  }
}
