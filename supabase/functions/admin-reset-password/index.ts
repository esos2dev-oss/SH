// Edge Function: admin-reset-password
// POST /functions/v1/admin-reset-password
// Body: { user_id, password }
//
// Cambia la contrasena de cualquier usuario via service role.
// Solo superadmin puede ejecutarla.

import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireUser, adminClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Metodo no permitido', 'METHOD_NOT_ALLOWED', 405);

  try {
    const { client, user } = await requireUser(req);

    const { data: caller } = await client.from('profiles').select('role').eq('id', user.id).single();
    if (caller?.role !== 'superadmin') {
      return errorResponse('Solo superadmin puede cambiar contrasenas', 'FORBIDDEN', 403);
    }

    const { user_id, password } = (await req.json()) as { user_id: string; password: string };
    if (!user_id || !password) {
      return errorResponse('Faltan parametros', 'VALIDATION_ERROR');
    }
    if (password.length < 8) {
      return errorResponse('La contrasena debe tener al menos 8 caracteres', 'VALIDATION_ERROR');
    }

    const admin = adminClient();
    const { error } = await admin.auth.admin.updateUserById(user_id, { password });
    if (error) return errorResponse(error.message, 'INTERNAL_ERROR', 500);

    return jsonResponse({ success: true, data: { user_id } });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : 'Error', 'INTERNAL_ERROR', 500);
  }
});
