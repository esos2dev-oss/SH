// AuthContext: sesion gestionada por Supabase Auth. user = profile (rol incluido).

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { supabase } from '../shared/lib/supabase';

export type Role = 'superadmin' | 'admin' | 'recepcion' | 'limpieza' | 'contabilidad' | 'restaurante';

export interface AuthUser {
  id: string;
  nombre: string;
  email: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<AuthUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nombre, email, role')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return data as AuthUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancel = false;

    (async () => {
      // El try/finally no es decorativo: si getSession() falla (token de una
      // instancia anterior, red caida), sin el nunca se libera isLoading y la
      // pantalla se queda en "Cargando sesion..." sin decir por que.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && !cancel) {
          const profile = await fetchProfile(session.user.id);
          if (!cancel) setUser(profile);
        }
      } catch {
        if (!cancel) setUser(null);
      } finally {
        if (!cancel) setIsLoading(false);
      }
    })();

    // IMPORTANTE: este callback NO puede ser async ni hacer await de ninguna
    // llamada a Supabase.
    //
    // auth-js invoca los subscribers con `await x.callback(...)` mientras
    // mantiene tomado el lock de la sesion (GoTrueClient._notifyAllSubscribers).
    // Cualquier peticion que necesite el access token entra por la rama
    // reentrante de `_acquireLock`, que hace `await last` sobre la operacion que
    // ya esta esperando a este mismo callback — espera circular. Y esa rama se
    // salta el timeout de 5s, asi que el cuelgue es permanente: la app se queda
    // en "Cargando sesion..." para siempre y no se recupera ni recargando,
    // porque el token invalido sigue en localStorage.
    //
    // La solucion es diferir el trabajo fuera del lock con un setTimeout(0).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null);
        return;
      }
      const userId = session.user.id;
      setTimeout(() => {
        if (!cancel) void fetchProfile(userId).then((profile) => {
          if (!cancel) setUser(profile);
        });
      }, 0);
    });

    return () => {
      cancel = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    // onAuthStateChange dispara el setUser
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
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
