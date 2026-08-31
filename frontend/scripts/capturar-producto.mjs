#!/usr/bin/env node
// Captura pantallas reales del producto para la landing.
//
//   node scripts/capturar-producto.mjs
//
// Requiere la aplicacion corriendo y la base con datos de demostracion:
//   supabase start && node scripts/seed-demo-users.mjs && npm run dev
//
// Por que un script y no capturas a mano: las imagenes de una landing envejecen
// en cuanto cambia la interfaz, y nadie se acuerda de rehacerlas. Asi se
// regeneran todas con un comando cuando el producto cambia.
//
// Las capturas van a frontend/public/producto/ y se sirven desde /sh/producto/.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = join(RAIZ, "public", "producto");

const BASE = process.env.APP_URL ?? 'http://localhost:5174/sh';
const EMAIL = process.env.DEMO_EMAIL ?? 'admin@local.test';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'admin123';

// Se capturan a 2x para que se vean nitidas en pantallas de alta densidad.
const ESCALA = 1.5;
const ANCHO = 1440;
const ALTO = 900;

const PANTALLAS = [
  { archivo: 'panel',       ruta: '/',                    espera: 'Ocupacion hoy' },
  { archivo: 'reservas',    ruta: '/reservas',            espera: null },
  { archivo: 'timeline',    ruta: '/reservas/timeline',   espera: null },
  { archivo: 'pagos',       ruta: '/pagos',               espera: null },
  { archivo: 'cierre-caja', ruta: '/pagos/cierre-caja',   espera: null },
  { archivo: 'habitaciones',ruta: '/habitaciones',        espera: null },
];

async function main() {
  await mkdir(SALIDA, { recursive: true });

  const navegador = await chromium.launch();

  for (const tema of ['claro', 'oscuro']) {
    const contexto = await navegador.newContext({
      viewport: { width: ANCHO, height: ALTO },
      deviceScaleFactor: ESCALA,
      locale: 'es-VE',
      colorScheme: tema === 'oscuro' ? 'dark' : 'light',
    });
    const pagina = await contexto.newPage();

    // Login una vez por contexto.
    await pagina.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await pagina.fill('input[type=email]', EMAIL);
    await pagina.fill('input[type=password]', PASSWORD);
    await pagina.click('button[type=submit]');
    await pagina.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20000 });

    for (const p of PANTALLAS) {
      await pagina.goto(`${BASE}${p.ruta}`, { waitUntil: 'networkidle' });
      // Margen para que terminen las transiciones de entrada de la propia app.
      await pagina.waitForTimeout(900);

      // JPEG de calidad alta en vez de PNG: en capturas de interfaz a 2x la
      // diferencia visual es inapreciable y el peso baja a la cuarta parte.
      // Una landing de 4 MB en imagenes tarda en aparecer justo donde se decide
      // si el visitante se queda.
      const destino = join(SALIDA, `${p.archivo}-${tema}.jpg`);
      await pagina.screenshot({ path: destino, type: 'jpeg', quality: 82 });
      console.log(`  ${p.archivo}-${tema}.jpg`);
    }

    await contexto.close();
  }

  await navegador.close();
  console.log(`\nCapturas en ${SALIDA}`);
}

main().catch((err) => {
  console.error('Fallo la captura:', err.message);
  console.error('Comprueba que la aplicacion responde en', BASE);
  process.exit(1);
});
