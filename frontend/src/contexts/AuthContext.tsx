// AuthContext: sesion gestionada por Supabase Auth. user = profile (rol incluido).

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { supabase } from '../shared/lib/supabase';

export type Role = 'superadmin' | 'admin' | 'recepcion' | 'limpieza' | 'contabilidad';

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

/** Registra el ultimo acceso. Best-effort: si falla, no bloquea el login. */
async function touchLastLogin(): Promise<void> {
  try {
    await supabase.rpc('touch_last_login');
  } catch {
    /* la columna last_login_at es informativa, no rompemos la sesion por esto */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Evita re-consultar el profile en cada TOKEN_REFRESHED (ocurre cada ~50min
  // y al recuperar el foco de la pestaña).
  const loadedUserId = useRef<string | null>(null);

  useEffect(() => {
    let cancel = false;

    async function loadProfile(userId: string, markLogin: boolean) {
      if (loadedUserId.current === userId) return;
      loadedUserId.current = userId;
      const profile = await fetchProfile(userId);
      // Si no se pudo leer el profile (red caida, RLS, usuario desactivado)
      // liberamos el guard para poder reintentar en el proximo evento.
      if (!profile) loadedUserId.current = null;
      if (!cancel) setUser(profile);
      if (profile && markLogin) void touchLastLogin();
    }

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && !cancel) {
        await loadProfile(session.user.id, false);
      }
      if (!cancel) setIsLoading(false);
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
    // en "Guardando..." para siempre y solo se recupera recargando.
    //
    // La solucion es diferir el trabajo fuera del lock con un setTimeout(0).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) {
        loadedUserId.current = null;
        setUser(null);
        return;
      }
      const userId = session.user.id;
      const markLogin = event === 'SIGNED_IN';
      setTimeout(() => {
        if (!cancel) void loadProfile(userId, markLogin);
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
    loadedUserId.current = null;
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
