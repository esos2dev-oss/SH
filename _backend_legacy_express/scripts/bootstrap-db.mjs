// Bootstrap inicial de DB: crea sh_user + sh_db conectandose como postgres.
// Lee credenciales de:
//   - POSTGRES_PASSWORD env var (la del super-usuario postgres)
//   - SH_USER / SH_PASSWORD env vars (default: sh_user / sh_pass)
//   - SH_DB env var (default: sh_db)
//
// Uso (desde backend/):
//   POSTGRES_PASSWORD=xxx node scripts/bootstrap-db.mjs

import pg from 'pg';

const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD;
if (!POSTGRES_PASSWORD) {
  console.error('ERROR: POSTGRES_PASSWORD env var requerido.');
  process.exit(1);
}

const SH_USER = process.env.SH_USER ?? 'sh_user';
const SH_PASSWORD = process.env.SH_PASSWORD ?? 'sh_pass';
const SH_DB = process.env.SH_DB ?? 'sh_db';

async function main() {
  // Conectar a la base 'postgres' como super-usuario
  const client = new pg.Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: POSTGRES_PASSWORD,
    database: 'postgres',
  });

  await client.connect();
  console.log('Conectado como postgres');

  // 1. Crear rol sh_user si no existe
  const { rows: roleRows } = await client.query(
    `SELECT 1 FROM pg_roles WHERE rolname = $1`,
    [SH_USER],
  );
  if (roleRows.length === 0) {
    // SH_USER/PASSWORD vienen de env, no de input externo, son safe para interpolar como identifier
    await client.query(`CREATE USER ${SH_USER} WITH PASSWORD '${SH_PASSWORD.replace(/'/g, "''")}'`);
    console.log(`  Rol ${SH_USER} creado`);
  } else {
    // Asegurar password actualizado
    await client.query(`ALTER USER ${SH_USER} WITH PASSWORD '${SH_PASSWORD.replace(/'/g, "''")}'`);
    console.log(`  Rol ${SH_USER} ya existia, password actualizado`);
  }

  // 2. Crear DB si no existe
  const { rows: dbRows } = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [SH_DB],
  );
  if (dbRows.length === 0) {
    await client.query(`CREATE DATABASE ${SH_DB} OWNER ${SH_USER}`);
    console.log(`  Base ${SH_DB} creada con owner ${SH_USER}`);
  } else {
    await client.query(`ALTER DATABASE ${SH_DB} OWNER TO ${SH_USER}`);
    console.log(`  Base ${SH_DB} ya existia, owner actualizado`);
  }

  // 3. Grant permisos
  await client.query(`GRANT ALL PRIVILEGES ON DATABASE ${SH_DB} TO ${SH_USER}`);

  await client.end();

  // 4. Conectarse a la nueva DB como postgres para asignar permisos en schema public
  const client2 = new pg.Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: POSTGRES_PASSWORD,
    database: SH_DB,
  });
  await client2.connect();
  await client2.query(`GRANT ALL ON SCHEMA public TO ${SH_USER}`);
  await client2.query(`ALTER SCHEMA public OWNER TO ${SH_USER}`);
  await client2.end();
  console.log('  Permisos en schema public asignados');

  console.log('OK bootstrap completo.');
}

main().catch((err) => {
  console.error('FALLO bootstrap:', err.message);
  process.exit(1);
});
