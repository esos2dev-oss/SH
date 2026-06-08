// Cliente unico de Supabase para el frontend.
// La sesion se persiste en localStorage; el SDK refresca tokens solo.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../api/client';

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
// Las edge functions devuelven { success, data } o { success: false, error, code }
// Si fallan, lanzamos ApiError preservando code (CONFLICT, VALIDATION_ERROR, etc.)
// para que la UI pueda diferenciar (ej: mostrar dialog de solapamiento).
export async function invokeFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // FunctionsHttpError (4xx/5xx) trae el body en error.context.response
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = error.message ?? 'Error en edge function';
    const ctx = (error as { context?: { response?: Response } }).context;
    if (ctx?.response) {
      status = ctx.response.status;
      try {
        const payload = await ctx.response.clone().json() as { error?: string; code?: string };
        if (payload?.error) message = payload.error;
        if (payload?.code) code = payload.code;
      } catch { /* body no JSON */ }
    }
    throw new ApiError(status, message, code);
  }
  const payload = data as { success: boolean; data?: T; error?: string; code?: string };
  if (!payload?.success) {
    throw new ApiError(400, payload?.error ?? 'Error en edge function', payload?.code ?? 'INTERNAL_ERROR');
  }
  return payload.data as T;
}
