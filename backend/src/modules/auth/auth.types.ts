// Types y rows del modulo auth.

import type { Role } from '../../shared/types/auth.js';

export interface UserRow {
  id: number;
  nombre: string;
  email: string;
  password_hash: string;
  role: Role;
  active: boolean;
  set_password_token: string | null;
  set_password_expires: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserSessionRow {
  id: number;
  user_id: number;
  refresh_token_hash: string;
  ip: string | null;
  user_agent: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: {
    id: number;
    nombre: string;
    email: string;
    role: Role;
  };
}
