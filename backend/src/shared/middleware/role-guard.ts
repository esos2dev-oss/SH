// roleGuard: restringe handlers a una lista de roles. Debe ir despues de verifyToken.

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { Errors } from '../utils/app-error.js';
import type { Role } from '../types/auth.js';

export function roleGuard(allowed: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(Errors.unauthorized());
    }
    if (!allowed.includes(req.user.role)) {
      return next(Errors.forbidden(`Tu rol (${req.user.role}) no tiene acceso a esta accion`));
    }
    next();
  };
}
