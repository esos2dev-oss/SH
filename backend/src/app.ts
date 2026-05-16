// Setup de Express: middleware, modulos, error handler.

import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';

import { env, isProd } from './shared/config/env.js';
import { logger } from './shared/utils/logger.js';
import { requestId } from './shared/middleware/request-id.js';
import { errorHandler, notFoundHandler } from './shared/middleware/error-handler.js';
import { generalLimiter } from './shared/middleware/rate-limit.js';

import authModule from './modules/auth/index.js';
import usersModule from './modules/users/index.js';
import roomTypesModule from './modules/room-types/index.js';
import roomsModule from './modules/rooms/index.js';
import customersModule from './modules/customers/index.js';
import bookingsModule from './modules/bookings/index.js';
import checkInsModule from './modules/check-ins/index.js';
import ledgerCategoriesModule from './modules/ledger-categories/index.js';
import ledgerModule from './modules/ledger/index.js';
import receiptsModule from './modules/receipts/index.js';
import reportsModule from './modules/reports/index.js';
import promotionsModule from './modules/promotions/index.js';
import emailTemplatesModule from './modules/email-templates/index.js';
import emailCampaignsModule from './modules/email-campaigns/index.js';
import auditLogModule from './modules/audit-log/index.js';
import settingsModule from './modules/settings/index.js';

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
  ledgerCategoriesModule,
  ledgerModule,
  receiptsModule,
  reportsModule,
  promotionsModule,
  emailTemplatesModule,
  emailCampaignsModule,
  auditLogModule,
  settingsModule,
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
