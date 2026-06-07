// Logica del modulo auth: login, refresh, set-password, change-password, logout.

import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';

import { env } from '../../shared/config/env.js';
import { withTransaction } from '../../shared/config/db.js';
import { AppError, Errors } from '../../shared/utils/app-error.js';
import { logger } from '../../shared/utils/logger.js';
import { logAudit } from '../../shared/services/audit.service.js';
import type { JwtAccessPayload, JwtRefreshPayload, Role } from '../../shared/types/auth.js';

import * as authModel from './auth.model.js';
import type {
  ChangePasswordInput,
  LoginInput,
  SetPasswordInput,
} from './auth.validation.js';
import type { LoginResult, UserRow } from './auth.types.js';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashRefresh(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function signAccess(user: { id: number; email: string; role: Role }): string {
  const payload: JwtAccessPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);
}

function signRefresh(userId: number, sessionId: number): string {
  const payload: JwtRefreshPayload = { sub: userId, sid: sessionId };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  } as SignOptions);
}

function toAuthUser(user: UserRow): LoginResult['user'] {
  return { id: user.id, nombre: user.nombre, email: user.email, role: user.role };
}

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export async function login(input: LoginInput, ctx: RequestContext): Promise<LoginResult> {
  const user = await authModel.findUserByEmail(input.email);
  if (!user) {
    throw new AppError('Email o password incorrectos', 400, 'INVALID_CREDENTIALS');
  }
  if (!user.active) {
    throw new AppError('La cuenta esta desactivada', 400, 'ACCOUNT_DISABLED');
  }
  const valid = await bcrypt.compare(input.password, user.password_hash);
  if (!valid) {
    throw new AppError('Email o password incorrectos', 400, 'INVALID_CREDENTIALS');
  }

  return withTransaction(async (client) => {
    await authModel.updateLastLogin(user.id, client);

    // Crear sesion temporalmente con refreshTokenHash placeholder, luego firmar y actualizar.
    // Mas simple: insert con hash del refresh ya emitido. Generamos rawRefresh aqui.
    const sessionInsert = await authModel.insertSession(
      {
        userId: user.id,
        refreshTokenHash: 'PENDING',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
      client,
    );

    const refreshToken = signRefresh(user.id, sessionInsert.id);
    const refreshHash = hashRefresh(refreshToken);
    await client.query('UPDATE user_sessions SET refresh_token_hash = $1 WHERE id = $2', [
      refreshHash,
      sessionInsert.id,
    ]);

    await logAudit(
      {
        userId: user.id,
        action: 'login',
        entity: 'users',
        entityId: user.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      client,
    );

    return {
      accessToken: signAccess(user),
      refreshToken,
      refreshExpiresAt: sessionInsert.expires_at,
      user: toAuthUser(user),
    };
  });
}

export async function refreshAccessToken(
  rawRefresh: string,
  ctx: RequestContext,
): Promise<LoginResult> {
  if (!rawRefresh) {
    throw Errors.unauthorized('Refresh token requerido');
  }

  let payload: JwtRefreshPayload;
  try {
    payload = jwt.verify(rawRefresh, env.JWT_REFRESH_SECRET) as unknown as JwtRefreshPayload;
  } catch {
    throw Errors.unauthorized('Refresh token invalido o expirado');
  }

  const refreshHash = hashRefresh(rawRefresh);
  const session = await authModel.findActiveSessionByHash(refreshHash);
  if (!session || session.user_id !== payload.sub) {
    throw Errors.unauthorized('Sesion no encontrada o revocada');
  }

  const user = await authModel.findUserById(payload.sub);
  if (!user || !user.active) {
    throw Errors.unauthorized('Usuario inactivo');
  }

  return withTransaction(async (client) => {
    const newSession = await authModel.rotateSession(
      session.id,
      {
        userId: user.id,
        refreshTokenHash: 'PENDING',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
      client,
    );
    const newRefresh = signRefresh(user.id, newSession.id);
    const newHash = hashRefresh(newRefresh);
    await client.query('UPDATE user_sessions SET refresh_token_hash = $1 WHERE id = $2', [
      newHash,
      newSession.id,
    ]);

    return {
      accessToken: signAccess(user),
      refreshToken: newRefresh,
      refreshExpiresAt: newSession.expires_at,
      user: toAuthUser(user),
    };
  });
}

export async function logout(rawRefresh: string | null, userId: number | null): Promise<void> {
  if (rawRefresh) {
    const hash = hashRefresh(rawRefresh);
    const session = await authModel.findActiveSessionByHash(hash);
    if (session) {
      await authModel.revokeSession(session.id);
    }
  }
  if (userId) {
    await logAudit({
      userId,
      action: 'logout',
      entity: 'users',
      entityId: userId,
    });
  }
}

export async function setPasswordWithToken(input: SetPasswordInput): Promise<void> {
  const user = await authModel.findUserByPasswordToken(input.token);
  if (!user) {
    throw Errors.validation('Token invalido o expirado');
  }
  const hash = await bcrypt.hash(input.password, env.BCRYPT_COST);
  await withTransaction(async (client) => {
    await authModel.updatePassword(user.id, hash, client);
    await authModel.revokeAllUserSessions(user.id, client);
    await logAudit(
      {
        userId: user.id,
        action: 'update',
        entity: 'users',
        entityId: user.id,
        after: { password_changed: true },
      },
      client,
    );
  });
  logger.info({ userId: user.id }, 'Password establecido via set-password');
}

export async function changePassword(
  userId: number,
  input: ChangePasswordInput,
): Promise<void> {
  const user = await authModel.findUserById(userId);
  if (!user) {
    throw Errors.notFound('Usuario no encontrado');
  }
  const valid = await bcrypt.compare(input.currentPassword, user.password_hash);
  if (!valid) {
    throw new AppError('Password actual incorrecto', 400, 'INVALID_CREDENTIALS');
  }
  const hash = await bcrypt.hash(input.newPassword, env.BCRYPT_COST);
  await withTransaction(async (client) => {
    await authModel.updatePassword(user.id, hash, client);
    await authModel.revokeAllUserSessions(user.id, client);
    await logAudit(
      {
        userId: user.id,
        action: 'update',
        entity: 'users',
        entityId: user.id,
        after: { password_changed: true },
      },
      client,
    );
  });
}

/** Genera un set_password_token + expiracion 24h. Devuelve el token raw para enviar por email. */
export async function generatePasswordToken(userId: number): Promise<string> {
  const raw = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await authModel.setPasswordToken(userId, raw, expires);
  return raw;
}

/**
 * Forgot password: si el email existe y el usuario esta activo, genera token
 * y envia email con link a /set-password/<token>. Siempre se responde igual al
 * caller — no revela si el email existe.
 */
export async function forgotPassword(email: string): Promise<void> {
  const { sendEmail } = await import('../../shared/services/email.service.js');
  const user = await authModel.findUserByEmail(email);
  if (!user || !user.active) {
    logger.info({ email }, 'forgot-password: usuario no existe o inactivo (responde 200 igual)');
    return;
  }
  const token = await generatePasswordToken(user.id);
  const setPasswordUrl = `${env.APP_URL}/set-password/${token}`;

  const result = await sendEmail({
    to: user.email,
    subject: 'Restablece tu contrasena',
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2>Hola ${user.nombre},</h2>
        <p>Recibimos una solicitud para restablecer tu contrasena.</p>
        <p>Haz click en el boton para definir una nueva contrasena. El enlace expira en 24 horas.</p>
        <p style="margin: 32px 0;">
          <a href="${setPasswordUrl}" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: bold;">
            Restablecer contrasena
          </a>
        </p>
        <p style="font-size: 12px; color: #6b7280;">
          Si no fuiste tu, ignora este mensaje y avisa al administrador.
        </p>
        <p style="font-size: 12px; color: #6b7280;">
          Si el boton no funciona, copia este enlace en tu navegador:<br>
          <code>${setPasswordUrl}</code>
        </p>
      </div>
    `,
  });

  await logAudit({
    userId: user.id,
    action: 'update',
    entity: 'users',
    entityId: user.id,
    after: { forgot_password_email_sent: result.ok },
  });

  if (!result.ok) {
    logger.info({ email: user.email, setPasswordUrl }, 'forgot-password: email NO enviado (Resend no configurado). Usa este link manualmente.');
  }
}

export async function getCurrentUser(userId: number): Promise<LoginResult['user'] | null> {
  const user = await authModel.findUserById(userId);
  if (!user || !user.active) return null;
  return toAuthUser(user);
}
