// Edge Function: booking-checkout
// POST /functions/v1/booking-checkout
// Body: { booking_id }
//
// Reglas:
//  - booking debe estar en estado 'en_curso'
//  - Tras check-out: booking.status='finalizada', room.status='limpieza',
//    check_ins.hora_salida=NOW(), checked_out_by=auth.uid

import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Metodo no permitido', 'METHOD_NOT_ALLOWED', 405);

  try {
    const { client, user } = await requireUser(req);
    const { booking_id } = (await req.json()) as { booking_id: number };
    if (!booking_id) return errorResponse('booking_id requerido', 'VALIDATION_ERROR');

    const { data: booking, error } = await client
      .from('bookings').select('id, status, room_id').eq('id', booking_id).single();
    if (error || !booking) return errorResponse('Reserva no encontrada', 'NOT_FOUND', 404);
    if (booking.status !== 'en_curso') {
      return errorResponse('La reserva no esta en curso', 'CONFLICT', 409);
    }

    await client.from('check_ins')
      .update({ hora_salida: new Date().toISOString(), checked_out_by: user.id })
      .eq('booking_id', booking.id);

    await client.from('bookings').update({ status: 'finalizada' }).eq('id', booking.id);
    await client.from('rooms').update({ status: 'limpieza' }).eq('id', booking.room_id);

    await client.from('audit_log').insert({
      user_id: user.id,
      action: 'status_change',
      entity: 'booking',
      entity_id: String(booking.id),
      after: { status: 'finalizada' },
    });

    return jsonResponse({ success: true, data: { booking_id: booking.id } });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : 'Error', 'INTERNAL_ERROR', 500);
  }
});
