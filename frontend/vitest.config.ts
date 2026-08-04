import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Config propia de test: NO carga el .env del desarrollador.
// Los modulos de infraestructura (shared/lib/supabase.ts) exigen las variables
// VITE_SUPABASE_* al importarse, asi que inyectamos valores ficticios. Ningun
// test hace red: el cliente de Supabase se mockea siempre.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key-no-es-un-secreto',
    },
  },
});
