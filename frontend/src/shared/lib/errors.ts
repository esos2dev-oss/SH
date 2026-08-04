// Normalizacion de errores para la UI.
//
// Problema que resuelve: el codigo estaba plagado de
//   toast.error(err instanceof ApiError ? err.message : 'Error')
// que convertia cualquier error que no fuera ApiError (o sea: todos los de
// supabase-js, que son Error o PostgrestError planos) en la palabra "Error".
// El usuario no tenia forma de saber que habia fallado.

import { ApiError } from '../api/client';

/** Codigos Postgres que sabemos traducir a lenguaje humano. */
const PG_MESSAGES: Record<string, string> = {
  '23505': 'Ya existe un registro con esos datos (duplicado).',
  '23503': 'El registro esta referenciado por otro y no se puede modificar.',
  '23514': 'Los datos no cumplen una validacion de la base de datos.',
  '23P01': 'Las fechas se solapan con otra reserva de la misma habitacion.',
  '42501': 'No tienes permisos para hacer esta operacion.',
  'PGRST116': 'No se encontro el registro solicitado.',
};

interface MaybePostgrest {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  error_description?: unknown;
}

/**
 * Devuelve un mensaje presentable para cualquier error.
 * Nunca devuelve la cadena generica "Error" salvo que no haya absolutamente
 * nada mejor que decir.
 */
export function errorMessage(err: unknown, fallback = 'No se pudo completar la operacion'): string {
  if (err instanceof ApiError) return err.message;

  if (err instanceof TimeoutError) return err.message;

  if (typeof err === 'string' && err.trim()) return err;

  if (err && typeof err === 'object') {
    const e = err as MaybePostgrest;

    const code = typeof e.code === 'string' ? e.code : null;
    if (code && PG_MESSAGES[code]) {
      const detail = typeof e.details === 'string' && e.details ? ` (${e.details})` : '';
      return PG_MESSAGES[code] + detail;
    }

    const msg =
      (typeof e.message === 'string' && e.message) ||
      (typeof e.error_description === 'string' && e.error_description) ||
      null;

    if (msg) {
      const hint = typeof e.hint === 'string' && e.hint ? ` ${e.hint}` : '';
      return msg + hint;
    }
  }

  return fallback;
}

/** Error de timeout de red, distinguible del resto. */
export class TimeoutError extends Error {
  constructor(operation: string, ms: number) {
    super(`La operacion "${operation}" no respondio en ${Math.round(ms / 1000)}s. Revisa tu conexion y vuelve a intentarlo.`);
    this.name = 'TimeoutError';
  }
}

/**
 * Envuelve una promesa con un timeout duro.
 *
 * Sin esto, una peticion colgada (ver el deadlock de auth-js que arreglamos en
 * AuthContext) deja el boton en "Guardando..." para siempre y el usuario no
 * sabe si el cobro se registro o no. Con dinero de por medio eso lleva a pagos
 * duplicados: preferimos fallar ruidosamente.
 */
export function withTimeout<T>(promise: Promise<T>, operation: string, ms = 20000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(operation, ms)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
