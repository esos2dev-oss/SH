// Middleware verifyToken: valida JWT del header Authorization y setea req.user.

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Errors } from '../utils/app-error.js';
import type { JwtAccessPayload } from '../types/auth.js';

export function verifyToken(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(Errors.unauthorized('Token de acceso requerido'));
  }
  const token = header.substring('Bearer '.length).trim();
  if (token.length === 0) {
    return next(Errors.unauthorized('Token vacio'));
  }
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as JwtAccessPayload;
    req.user = {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
      nombre: '',
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(Errors.unauthorized('Token expirado'));
    }
    return next(Errors.unauthorized('Token invalido'));
  }
}

/** Helper: si hay token lo valida, si no continua sin user. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }
  const token = header.substring('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as JwtAccessPayload;
    req.user = { id: payload.sub, role: payload.role, email: payload.email, nombre: '' };
  } catch {
    // ignorar, sigue sin user
  }
  next();
}
