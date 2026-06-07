// Types de autenticacion / autorizacion.

export type Role = 'superadmin' | 'admin' | 'recepcion' | 'limpieza' | 'contabilidad';

export const ALL_ROLES: Role[] = ['superadmin', 'admin', 'recepcion', 'limpieza', 'contabilidad'];

export interface AuthUser {
  id: number;
  nombre: string;
  email: string;
  role: Role;
}

export interface JwtAccessPayload {
  sub: number;
  role: Role;
  email: string;
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  sub: number;
  sid: number;
  iat?: number;
  exp?: number;
}
