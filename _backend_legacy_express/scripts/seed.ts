// Aplica seeds SQL en orden. Idempotente (los seeds usan ON CONFLICT DO NOTHING).
// Uso: npm run seed

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { pool, closePool } from '../src/shared/config/db.js';
import { logger } from '../src/shared/utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEEDS_DIR = resolve(__dirname, '../seeds');

async function main(): Promise<void> {
  const files = (await readdir(SEEDS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  logger.info(`Aplicando ${files.length} seeds...`);

  for (const name of files) {
    const sql = await readFile(join(SEEDS_DIR, name), 'utf-8');
    await pool.query(sql);
    logger.info(`  ✓ Seed: ${name}`);
  }

  // Mostrar el set_password_token del admin si existe (para crear su password)
  const { rows } = await pool.query<{ email: string; token: string | null }>(
    `SELECT email, set_password_token AS token FROM users WHERE role = 'superadmin' AND active = true LIMIT 1`,
  );
  if (rows[0]?.token) {
    logger.info('===========================================================');
    logger.info(`ADMIN INICIAL: ${rows[0].email}`);
    logger.info('Para establecer la password ve a:');
    logger.info(`  ${process.env['APP_URL'] ?? 'http://localhost:5173/sh'}/set-password/${rows[0].token}`);
    logger.info('Token valido por 7 dias desde la creacion del seed.');
    logger.info('===========================================================');
  }

  await closePool();
}

main().catch(async (err) => {
  logger.error({ err }, 'Error aplicando seeds');
  await closePool().catch(() => undefined);
  process.exit(1);
});
