// Rate limiters preconfigurados por uso. Usa express-rate-limit en memoria.
// En multi-instancia migrar a redis store.

import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const loginLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  max: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Demasiados intentos de inicio de sesion. Intenta de nuevo en 15 minutos.',
    code: 'RATE_LIMITED',
  },
});

export const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Demasiadas peticiones, intenta luego.',
    code: 'RATE_LIMITED',
  },
});
