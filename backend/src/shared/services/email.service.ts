// Wrapper sobre Resend. Si Resend no esta configurado, las llamadas son no-op
// con log warning.

import { resend, resendConfigured } from '../config/resend.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export interface SendResult {
  ok: boolean;
  providerId?: string;
  error?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  if (!resendConfigured || !resend) {
    logger.warn({ to: input.to, subject: input.subject }, 'Email NO enviado: Resend no configurado');
    return { ok: false, error: 'RESEND_NOT_CONFIGURED' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text && { text: input.text }),
      ...(input.replyTo && { replyTo: input.replyTo }),
      ...(env.EMAIL_REPLY_TO && !input.replyTo && { replyTo: env.EMAIL_REPLY_TO }),
      ...(input.tags && { tags: input.tags }),
    });
    if (error) {
      logger.error({ error }, 'Error enviando email via Resend');
      return { ok: false, error: error.message };
    }
    return { ok: true, providerId: data?.id };
  } catch (err) {
    logger.error({ err }, 'Excepcion enviando email');
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

