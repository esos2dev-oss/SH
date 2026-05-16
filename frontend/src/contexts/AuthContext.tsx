// AuthContext: maneja login, logout, refresh, usuario actual.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { api, setAccessToken, ApiError } from '../shared/api/client';

export type Role = 'superadmin' | 'admin' | 'recepcion' | 'limpieza' | 'contabilidad';

export interface AuthUser {
  id: number;
  nombre: string;
  email: string;
  role: Role;
}

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Al boot, intentar refrescar la sesion via cookie httpOnly
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const data = await api.post<LoginResponse>('/api/auth/refresh', undefined, { skipRefresh: true });
        if (!cancel) {
          setAccessToken(data.accessToken);
          setUser(data.user);
        }
      } catch {
        // No habia sesion previa, ok
      } finally {
        if (!cancel) setIsLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const data = await api.post<LoginResponse>(
        '/api/auth/login',
        { email, password },
        { skipRefresh: true },
      );
      setAccessToken(data.accessToken);
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(500, 'Error de conexion', 'INTERNAL_ERROR');
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout', undefined, { skipRefresh: true });
    } catch {
      // ignore
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
