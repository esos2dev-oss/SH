// Error de aplicacion con statusCode y code de negocio.
// Lanzar desde services y handlers; el errorHandler lo formatea.

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'ROOM_NOT_AVAILABLE'
  | 'OVERLAP_CONFLICT'
  | 'INVALID_PROMOTION'
  | 'PAYMENT_EXCEEDS_TOTAL';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code: ErrorCode = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export const Errors = {
  validation: (message: string, details?: unknown) =>
    new AppError(message, 400, 'VALIDATION_ERROR', details),
  unauthorized: (message = 'No autenticado') =>
    new AppError(message, 401, 'UNAUTHORIZED'),
  forbidden: (message = 'Sin permisos para esta accion') =>
    new AppError(message, 403, 'FORBIDDEN'),
  notFound: (message = 'Recurso no encontrado') =>
    new AppError(message, 404, 'NOT_FOUND'),
  conflict: (message: string, code: ErrorCode = 'CONFLICT') =>
    new AppError(message, 409, code),
  rateLimited: (message = 'Demasiadas peticiones, intenta luego') =>
    new AppError(message, 429, 'RATE_LIMITED'),
  internal: (message = 'Error interno del servidor') =>
    new AppError(message, 500, 'INTERNAL_ERROR'),
} as const;
