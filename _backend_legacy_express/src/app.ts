// Setup de Express: middleware, modulos, error handler.

import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { env, isProd } from './shared/config/env.js';
import { logger } from './shared/utils/logger.js';
import { requestId } from './shared/middleware/request-id.js';
import { errorHandler, notFoundHandler } from './shared/middleware/error-handler.js';
import { generalLimiter } from './shared/middleware/rate-limit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = resolve(__dirname, '../uploads');

import authModule from './modules/auth/index.js';
import usersModule from './modules/users/index.js';
import roomTypesModule from './modules/room-types/index.js';
import roomsModule from './modules/rooms/index.js';
import customersModule from './modules/customers/index.js';
import bookingsModule from './modules/bookings/index.js';
import checkInsModule from './modules/check-ins/index.js';
import paymentsModule from './modules/payments/index.js';
import ledgerCategoriesModule from './modules/ledger-categories/index.js';
import ledgerModule from './modules/ledger/index.js';
import receiptsModule from './modules/receipts/index.js';
import reportsModule from './modules/reports/index.js';
import auditLogModule from './modules/audit-log/index.js';
import settingsModule from './modules/settings/index.js';
import dashboardModule from './modules/dashboard/index.js';
import searchModule from './modules/search/index.js';
import notificationsModule from './modules/notifications/index.js';

interface ModuleDefinition {
  prefix: string;
  router: express.Router;
}

const modules: ModuleDefinition[] = [
  authModule,
  usersModule,
  roomTypesModule,
  roomsModule,
  customersModule,
  bookingsModule,
  checkInsModule,
  paymentsModule,
  ledgerCategoriesModule,
  ledgerModule,
  receiptsModule,
  reportsModule,
  auditLogModule,
  settingsModule,
  dashboardModule,
  searchModule,
  notificationsModule,
];

export function createApp(): Application {
  const app = express();

  app.set('trust proxy', 1);

  // Seguridad y CORS
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );

  // Parsers
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Request ID + logger HTTP
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ requestId: (req as express.Request).requestId }),
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );

  // Static uploads (receipts locales cuando R2 no esta configurado)
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d', index: false, dotfiles: 'ignore' }));

  // Rate limit general
  app.use('/api/', generalLimiter);

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] ?? '0.1.0',
      uptime: process.uptime(),
      env: env.NODE_ENV,
    });
  });

  // Modulos
  for (const mod of modules) {
    app.use(mod.prefix, mod.router);
  }

  // 404 + error handler
  app.use(notFoundHandler);
  app.use(errorHandler);

  if (!isProd) {
    logger.info({ modules: modules.map((m) => m.prefix) }, 'Modulos registrados');
  }

  return app;
}
