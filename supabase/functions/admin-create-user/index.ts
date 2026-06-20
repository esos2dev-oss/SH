// Edge Function: admin-create-user
// POST /functions/v1/admin-create-user
// Body: { email, nombre, role, password }
//
// Crea un usuario en auth.users via service role con password directa
// (sin email de invitacion). El trigger handle_new_user crea profile.
//
// Solo superadmin puede invocar esta funcion (lo verificamos via has_role).

import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireUser, adminClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Metodo no permitido', 'METHOD_NOT_ALLOWED', 405);

  try {
    const { client, user } = await requireUser(req);

    // Verificar que quien llama es superadmin
    const { data: caller } = await client.from('profiles').select('role').eq('id', user.id).single();
    if (caller?.role !== 'superadmin') {
      return errorResponse('Solo superadmin', 'FORBIDDEN', 403);
    }

    const { email, nombre, role, password } = (await req.json()) as {
      email: string; nombre: string; role: string; password: string;
    };

    const ROLES = ['superadmin', 'admin', 'recepcion', 'limpieza', 'contabilidad'];
    if (!email || !nombre || !ROLES.includes(role)) {
      return errorResponse('Datos invalidos', 'VALIDATION_ERROR');
    }
    if (!password || password.length < 8) {
      return errorResponse('La contrasena debe tener al menos 8 caracteres', 'VALIDATION_ERROR');
    }

    const admin = adminClient();

    // createUser: usuario activo con password directa, sin email de confirmacion.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, role },
    });
    if (error) return errorResponse(error.message, 'INTERNAL_ERROR', 500);

    return jsonResponse({ success: true, data: { user_id: data.user?.id, email } });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : 'Error', 'INTERNAL_ERROR', 500);
  }
});
