// Bootstrap del servidor HTTP. Maneja shutdown limpio.

import * as Sentry from '@sentry/node';
import { createApp } from './app.js';
import { env } from './shared/config/env.js';
import { logger } from './shared/utils/logger.js';
import { closePool } from './shared/config/db.js';

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 0,
  });
  logger.info('Sentry inicializado');
}

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, `API escuchando en :${env.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Iniciando shutdown limpio...');
  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error cerrando server');
      process.exit(1);
    }
    try {
      await closePool();
      logger.info('Pool Postgres cerrado');
    } catch (poolErr) {
      logger.error({ err: poolErr }, 'Error cerrando pool');
    }
    process.exit(0);
  });

  // Timeout duro
  setTimeout(() => {
    logger.error('Shutdown forzado por timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaughtException — shutdown forzado');
  process.exit(1);
});
