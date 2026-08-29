// Operaciones de autenticacion contra Supabase Auth.

import { supabase } from '../../../shared/lib/supabase';

/**
 * Establece la password despues de aceptar la invitacion.
 * Supabase Auth redirige al usuario a `/sh/establecer-clave?...` tras hacer click
 * en el magic link; el SDK detecta el token en la URL (detectSessionInUrl=true).
 */
export async function setPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export async function forgotPassword(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}/sh/establecer-clave`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(error.message);
}
