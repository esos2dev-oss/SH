// Cliente unico de Supabase para el frontend.
// La sesion se persiste en localStorage; el SDK refresca tokens solo.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Copia frontend/.env.example a .env y completa.'
  );
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

// Helper: llama una edge function autenticada.
export async function invokeFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  // Las edge functions devuelven { success, data } o { success: false, error, code }
  const payload = data as { success: boolean; data?: T; error?: string; code?: string };
  if (!payload?.success) {
    throw new Error(payload?.error ?? 'Error en edge function');
  }
  return payload.data as T;
}
