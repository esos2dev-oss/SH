#!/usr/bin/env node
// Crea los usuarios de demostracion y los enlaza al hotel del seed.
//
// Hace falta porque las migraciones no pueden crear cuentas: los usuarios viven
// en auth.users, que gestiona GoTrue, no el esquema public. Sin este paso, una
// base recien creada no tiene con quien entrar — y el seed de datos de prueba
// se salta solo, porque busca un superadmin que todavia no existe.
//
//   node scripts/seed-demo-users.mjs
//
// Lee SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno; si no estan, usa
// los valores por defecto del CLI local (que son publicos y conocidos).

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const PASSWORD = process.env.DEMO_PASSWORD ?? 'admin123';

const USUARIOS = [
  { email: 'admin@local.test',        nombre: 'Administrador', role: 'superadmin',   hotelRole: 'owner' },
  { email: 'recepcion@local.test',    nombre: 'Recepcion',     role: 'recepcion',    hotelRole: 'recepcion' },
  { email: 'contabilidad@local.test', nombre: 'Contabilidad',  role: 'contabilidad', hotelRole: 'contabilidad' },
  { email: 'limpieza@local.test',     nombre: 'Limpieza',      role: 'limpieza',     hotelRole: 'limpieza' },
];

const cabeceras = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path, options = {}) {
  const res = await fetch(`${URL}${path}`, { ...options, headers: { ...cabeceras, ...options.headers } });
  const texto = await res.text();
  let cuerpo = null;
  try { cuerpo = texto ? JSON.parse(texto) : null; } catch { cuerpo = texto; }
  return { ok: res.ok, status: res.status, cuerpo };
}

async function main() {
  if (process.env.SUPABASE_URL && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Has indicado SUPABASE_URL pero no SUPABASE_SERVICE_ROLE_KEY.');
    console.error('Nunca uses la clave local por defecto contra un proyecto real.');
    process.exit(1);
  }

  // Hotel al que se enlazan. Es el del seed.
  const hoteles = await rest('/rest/v1/hotels?select=id,nombre&slug=eq.hotel-demo');
  if (!hoteles.ok || !hoteles.cuerpo?.length) {
    console.error('No se encontro el hotel del seed. Ejecuta antes: supabase db reset');
    process.exit(1);
  }
  const hotel = hoteles.cuerpo[0];
  console.log(`Hotel: ${hotel.nombre} (id ${hotel.id})`);

  let creados = 0;
  for (const u of USUARIOS) {
    const alta = await rest('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { nombre: u.nombre, role: u.role },
      }),
    });

    let userId = alta.cuerpo?.id;

    // Ya existia: se recupera su id en vez de fallar, para que el script se
    // pueda ejecutar las veces que haga falta.
    if (!alta.ok) {
      const existentes = await rest(`/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(u.email)}`);
      userId = existentes.cuerpo?.[0]?.id;
      if (!userId) {
        console.error(`  ${u.email}: no se pudo crear ni encontrar`, alta.cuerpo);
        continue;
      }
      console.log(`  ${u.email} — ya existia`);
    } else {
      creados++;
      console.log(`  ${u.email} — creado`);
    }

    const membresia = await rest('/rest/v1/hotel_members', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ hotel_id: hotel.id, user_id: userId, role: u.hotelRole }),
    });
    if (!membresia.ok) {
      console.error(`  ${u.email}: no se pudo enlazar al hotel`, membresia.cuerpo);
    }
  }

  console.log(`\nListo. ${creados} usuarios creados, ${USUARIOS.length} enlazados a "${hotel.nombre}".`);
  console.log(`Entra con admin@local.test / ${PASSWORD}`);
}

main().catch((err) => {
  console.error('Fallo el arranque de usuarios:', err);
  process.exit(1);
});
