// Logica de users. Crea usuario + dispara email con set_password_token.

import { Errors } from '../../shared/utils/app-error.js';
import { withTransaction } from '../../shared/config/db.js';
import { logAudit } from '../../shared/services/audit.service.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { env } from '../../shared/config/env.js';
import { logger } from '../../shared/utils/logger.js';

import * as authService from '../auth/auth.service.js';
import * as usersModel from './users.model.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.validation.js';
import type { UserPublic } from './users.types.js';
import type { UserRow } from '../auth/auth.types.js';

function toPublic(u: UserRow): UserPublic {
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    role: u.role,
    active: u.active,
    last_login_at: u.last_login_at?.toISOString() ?? null,
    created_at: u.created_at.toISOString(),
  };
}

export async function list(filters: ListUsersQuery): Promise<{ items: UserPublic[]; total: number }> {
  const result = await usersModel.listUsers(filters);
  return { items: result.items.map(toPublic), total: result.total };
}

export async function getById(id: number): Promise<UserPublic> {
  const u = await usersModel.findById(id);
  if (!u) throw Errors.notFound('Usuario no encontrado');
  return toPublic(u);
}

export async function createUser(input: CreateUserInput, actorId: number): Promise<{ user: UserPublic; token: string }> {
  if (await usersModel.emailExists(input.email)) {
    throw Errors.conflict('Ya existe un usuario con ese email');
  }
  const result = await withTransaction(async (client) => {
    const user = await usersModel.create(input, client);
    await logAudit(
      {
        userId: actorId,
        action: 'create',
        entity: 'users',
        entityId: user.id,
        after: { email: user.email, role: user.role },
      },
      client,
    );
    return user;
  });

  const token = await authService.generatePasswordToken(result.id);

  // Disparar email — best effort
  const inviteUrl = `${env.APP_URL}/set-password/${token}`;
  const sendResult = await sendEmail({
    to: result.email,
    subject: `Bienvenido a ${env.HOTEL_NAME} — establece tu password`,
    html: `
      <p>Hola ${escapeHtml(result.nombre)},</p>
      <p>Se ha creado tu cuenta en <strong>${escapeHtml(env.HOTEL_NAME)}</strong>.</p>
      <p>Establece tu password en este enlace (valido 24h):</p>
      <p><a href="${inviteUrl}">${inviteUrl}</a></p>
    `,
    text: `Hola ${result.nombre}, establece tu password aqui (24h): ${inviteUrl}`,
  });
  if (!sendResult.ok) {
    logger.warn({ userId: result.id, error: sendResult.error }, 'No se pudo enviar email de invitacion');
  }

  return { user: toPublic(result), token };
}

export async function updateUser(id: number, input: UpdateUserInput, actorId: number): Promise<UserPublic> {
  const before = await usersModel.findById(id);
  if (!before) throw Errors.notFound('Usuario no encontrado');
  if (input.email && (await usersModel.emailExists(input.email, id))) {
    throw Errors.conflict('Ya existe otro usuario con ese email');
  }
  const updated = await withTransaction(async (client) => {
    const u = await usersModel.update(id, input, client);
    if (!u) throw Errors.notFound('Usuario no encontrado');
    await logAudit(
      {
        userId: actorId,
        action: 'update',
        entity: 'users',
        entityId: id,
        before: { email: before.email, role: before.role, active: before.active },
        after: { email: u.email, role: u.role, active: u.active },
      },
      client,
    );
    return u;
  });
  return toPublic(updated);
}

export async function softDelete(id: number, actorId: number): Promise<void> {
  const ok = await usersModel.softDelete(id);
  if (!ok) throw Errors.notFound('Usuario no encontrado o ya inactivo');
  await logAudit({
    userId: actorId,
    action: 'delete',
    entity: 'users',
    entityId: id,
  });
}

export async function resendInvite(id: number, actorId: number): Promise<void> {
  const u = await usersModel.findById(id);
  if (!u) throw Errors.notFound('Usuario no encontrado');
  const token = await authService.generatePasswordToken(u.id);
  const inviteUrl = `${env.APP_URL}/set-password/${token}`;
  await sendEmail({
    to: u.email,
    subject: `Reenvio de invitacion — ${env.HOTEL_NAME}`,
    html: `<p>Hola ${escapeHtml(u.nombre)}, establece tu password (24h): <a href="${inviteUrl}">${inviteUrl}</a></p>`,
    text: `Establece tu password aqui: ${inviteUrl}`,
  });
  await logAudit({
    userId: actorId,
    action: 'update',
    entity: 'users',
    entityId: id,
    after: { invite_resent: true },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
