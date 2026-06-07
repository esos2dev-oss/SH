// Helpers de auth reutilizables para los modulos.
import { supabase } from './supabase';

export async function currentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  return user.id;
}

// Mapea errores de Supabase a Error con codigo, para uniformar el catch en UI.
export function mapError(err: unknown, fallback = 'Error'): Error {
  if (err instanceof Error) return err;
  if (typeof err === 'object' && err && 'message' in err) {
    return new Error(String((err as { message: unknown }).message));
  }
  return new Error(fallback);
}
