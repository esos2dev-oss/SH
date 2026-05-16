// Vitest global setup: setea env vars minimas para que los modulos que importan
// src/shared/config/env.ts no fallen al boot durante tests unitarios.
//
// Tests de integracion que necesiten una BD real deben usar testcontainers o
// fijar DATABASE_URL apuntando a una instancia disponible.

process.env['NODE_ENV'] ??= 'test';
process.env['APP_URL'] ??= 'http://localhost:5173';
process.env['API_URL'] ??= 'http://localhost:3002';
process.env['DATABASE_URL'] ??= 'postgresql://sh_user:sh_pass@localhost:5432/sh_test';
process.env['JWT_ACCESS_SECRET'] ??= 'test-access-secret-min-32-chars-aaaaaaaa';
process.env['JWT_REFRESH_SECRET'] ??= 'test-refresh-secret-min-32-chars-bbbbbbbb';
process.env['CORS_ORIGIN'] ??= 'http://localhost:5173';
