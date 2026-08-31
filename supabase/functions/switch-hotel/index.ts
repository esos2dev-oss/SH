// Edge Function: switch-hotel
// POST /functions/v1/switch-hotel
// Body: { hotel_id: number }
//
// Cambia el hotel activo del usuario escribiendo app_metadata.active_hotel.
//
// Por que hace falta una funcion de servidor para esto: app_metadata solo lo
// puede escribir service_role. Si el hotel activo viviera en user_metadata, que
// si es editable desde el navegador, cualquiera podria ponerse el id de otro
// hotel. Aqui se comprueba la pertenencia ANTES de escribir nada.
//
// La base valida igualmente en current_hotel_id(), asi que aunque este claim se
// manipulara, no daria acceso. Esto es la primera barrera, no la unica.

import { requireUser, adminClient } from '../_shared/supabase.ts';
import { corsFor, json, fail } from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsFor(req) });
  if (req.method !== 'POST') return fail('Metodo no permitido', 'METHOD_NOT_ALLOWED', 405, req);

  try {
    const { client, user } = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as { hotel_id?: unknown };

    const hotelId = Number(body.hotel_id);
    if (!Number.isInteger(hotelId) || hotelId <= 0) {
      return fail('hotel_id no valido', 'VALIDATION_ERROR', 400, req);
    }

    // La comprobacion se hace con el JWT del usuario, sujeta a RLS: si no
    // pertenece al hotel, la consulta no devuelve nada. No se usa service_role
    // para esto a proposito — saltarse RLS aqui seria saltarse la comprobacion.
    const { data: miembro, error } = await client
      .from('hotel_members')
      .select('hotel_id, role')
      .eq('hotel_id', hotelId)
      .maybeSingle();

    if (error) return fail(error.message, 'INTERNAL_ERROR', 500, req);
    if (!miembro) return fail('No perteneces a ese hotel', 'FORBIDDEN', 403, req);

    const admin = adminClient();
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { active_hotel: String(hotelId) },
    });
    if (updErr) return fail(updErr.message, 'INTERNAL_ERROR', 500, req);

    // El cliente debe refrescar la sesion para que el token nuevo lleve el
    // claim: hasta entonces sigue operando con el hotel anterior.
    return json(
      { success: true, hotel_id: hotelId, role: miembro.role, refresh_required: true },
      200,
      req,
    );
  } catch (err) {
    if (err instanceof Response) return err;
    return fail(err instanceof Error ? err.message : 'Error', 'INTERNAL_ERROR', 500, req);
  }
});
