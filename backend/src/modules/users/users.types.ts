import type { Role } from '../../shared/types/auth.js';

export interface UserPublic {
  id: number;
  nombre: string;
  email: string;
  role: Role;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}
