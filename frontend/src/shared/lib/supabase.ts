// Cliente unico de Supabase para el frontend.
// La sesion se persiste en localStorage; el SDK refresca tokens solo.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../api/client';
import { withTimeout } from './errors';

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
  body?: Record<string, unknown>,
  options?: { timeoutMs?: number }
): Promise<T> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke(name, { body }),
    name,
    options?.timeoutMs ?? 20000,
  );

  if (error) {
    // OJO: en @supabase/functions-js, FunctionsHttpError se construye como
    // `new FunctionsHttpError(response)`, asi que `error.context` ES el Response,
    // no `{ response }`. Leerlo mal hacia que TODOS los errores de edge function
    // llegaran a la UI como "Edge Function returned a non-2xx status code" y se
    // perdiera el mensaje real en español que la funcion ya devuelve.
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = error.message ?? 'Error en edge function';

    const ctx = (error as { context?: unknown }).context;
    const response =
      ctx instanceof Response
        ? ctx
        : (ctx as { response?: Response } | null | undefined)?.response;

    if (response instanceof Response) {
      status = response.status;
      try {
        const payload = (await response.clone().json()) as { error?: string; code?: string };
        if (payload?.error) message = payload.error;
        if (payload?.code) code = payload.code;
      } catch {
        // El body no era JSON: intentamos texto plano antes de rendirnos.
        try {
          const text = (await response.clone().text()).trim();
          if (text) message = text.slice(0, 300);
        } catch { /* nada que hacer */ }
      }
    }
    throw new ApiError(status, message, code);
  }

  const payload = data as { success: boolean; data?: T; error?: string; code?: string };
  if (!payload?.success) {
    throw new ApiError(400, payload?.error ?? 'Error en edge function', payload?.code ?? 'INTERNAL_ERROR');
  }
  return payload.data as T;
}
