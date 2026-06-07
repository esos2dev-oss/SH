// Middleware central de errores. Convierte AppError, ZodError y demas a el formato API.

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND',
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // Zod
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Datos de entrada invalidos',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    });
    return;
  }

  // AppError
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId: req.requestId, path: req.originalUrl }, err.message);
    }
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      ...(err.details !== undefined && { details: err.details }),
    });
    return;
  }

  // Error generico
  const e = err as Error & { statusCode?: number; code?: string };
  const fallback =
    e.code === 'ECONNREFUSED' ? 'No se pudo conectar a la base de datos'
    : e.message && e.message.trim().length > 0 ? e.message
    : 'Error interno del servidor';

  logger.error({ err, requestId: req.requestId, path: req.originalUrl }, fallback);

  res.status(500).json({
    success: false,
    error: isProd ? 'Error interno del servidor' : fallback,
    code: 'INTERNAL_ERROR',
  });
}
