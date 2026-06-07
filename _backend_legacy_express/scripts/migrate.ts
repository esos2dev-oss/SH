// Aplica migraciones SQL en orden, registrando en _migrations.
// Uso:
//   npm run migrate           — aplica pendientes
//   npm run migrate:status    — muestra estado sin aplicar

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { pool, closePool } from '../src/shared/config/db.js';
import { logger } from '../src/shared/utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../migrations');

interface MigrationFile {
  name: string;
  path: string;
}

async function listMigrations(): Promise<MigrationFile[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, path: join(MIGRATIONS_DIR, name) }));
}

async function getApplied(): Promise<Set<string>> {
  // Asegurar que la tabla existe (la primera migration la crea).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM _migrations');
  return new Set(rows.map((r) => r.name));
}

async function applyMigration(file: MigrationFile): Promise<void> {
  const sql = await readFile(file.path, 'utf-8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file.name]);
    await client.query('COMMIT');
    logger.info(`  ✓ Aplicada: ${file.name}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const statusOnly = process.argv.includes('--status');

  const all = await listMigrations();
  const applied = await getApplied();

  const pending = all.filter((m) => !applied.has(m.name));

  logger.info(`Migraciones encontradas: ${all.length}, aplicadas: ${applied.size}, pendientes: ${pending.length}`);
  for (const m of all) {
    const mark = applied.has(m.name) ? '[x]' : '[ ]';
    logger.info(`  ${mark} ${m.name}`);
  }

  if (statusOnly) {
    await closePool();
    return;
  }

  if (pending.length === 0) {
    logger.info('Sin migraciones pendientes.');
    await closePool();
    return;
  }

  logger.info(`Aplicando ${pending.length} migraciones...`);
  for (const m of pending) {
    await applyMigration(m);
  }
  logger.info('Migraciones completadas.');
  await closePool();
}

main().catch(async (err) => {
  logger.error({ err }, 'Error aplicando migraciones');
  await closePool().catch(() => undefined);
  process.exit(1);
});
