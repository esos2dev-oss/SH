// Handlers HTTP del modulo auth.

import type { Request, Response } from 'express';

import { env, isProd } from '../../shared/config/env.js';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';

import {
  loginSchema,
  setPasswordSchema,
  changePasswordSchema,
  forgotPasswordSchema,
} from './auth.validation.js';
import * as authService from './auth.service.js';

const REFRESH_COOKIE = 'sh_refresh';

function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE || isProd,
    sameSite: 'strict',
    domain: env.COOKIE_DOMAIN === 'localhost' ? undefined : env.COOKIE_DOMAIN,
    path: '/',
    expires: expiresAt,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.COOKIE_SECURE || isProd,
    sameSite: 'strict',
    domain: env.COOKIE_DOMAIN === 'localhost' ? undefined : env.COOKIE_DOMAIN,
    path: '/',
  });
}

function getRequestContext(req: Request): { ip: string | null; userAgent: string | null } {
  return {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input, getRequestContext(req));
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  ok(res, { accessToken: result.accessToken, user: result.user });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) throw Errors.unauthorized('Refresh token no presente');
  const result = await authService.refreshAccessToken(raw, getRequestContext(req));
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  ok(res, { accessToken: result.accessToken, user: result.user });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const raw = req.cookies?.[REFRESH_COOKIE] ?? null;
  await authService.logout(raw, req.user?.id ?? null);
  clearRefreshCookie(res);
  ok(res, null);
}

export async function setPassword(req: Request, res: Response): Promise<void> {
  const input = setPasswordSchema.parse(req.body);
  await authService.setPasswordWithToken(input);
  ok(res, { message: 'Password establecido correctamente' });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const input = changePasswordSchema.parse(req.body);
  await authService.changePassword(req.user.id, input);
  clearRefreshCookie(res);
  ok(res, { message: 'Password actualizado. Vuelve a iniciar sesion.' });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  // Acepta email pero siempre responde 200 sin revelar existencia.
  forgotPasswordSchema.parse(req.body);
  // TODO Fase 02 final: implementar generacion de token + envio Resend
  ok(res, { message: 'Si el email existe, recibiras instrucciones para restablecer la password.' });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const user = await authService.getCurrentUser(req.user.id);
  if (!user) throw Errors.notFound('Usuario no encontrado');
  ok(res, user);
}
