// Cliente Resend para email transaccional + campañas.

import { Resend } from 'resend';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let _client: Resend | null = null;

if (env.RESEND_API_KEY) {
  _client = new Resend(env.RESEND_API_KEY);
} else {
  logger.warn('RESEND_API_KEY no configurada — el envio de emails estara desactivado');
}

export const resend = _client;
export const resendConfigured = _client !== null;
