// Edge Function: booking-checkout
// POST /functions/v1/booking-checkout
// Body: { booking_id, notas_limpieza? }
//
// Reglas:
//  - booking debe estar en estado 'en_curso'
//  - Tras check-out:
//      booking.status='finalizada'
//      room.status='limpieza'
//      check_ins.hora_salida=NOW(), checked_out_by=auth.uid
//      cleaning_orders: se crea orden via RPC create_cleaning_order
// Response: { booking_id, room_id, cleaning_order_id }

import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Metodo no permitido', 'METHOD_NOT_ALLOWED', 405);

  try {
    const { client, user } = await requireUser(req);
    const body = (await req.json()) as { booking_id: number; notas_limpieza?: string };
    if (!body.booking_id) return errorResponse('booking_id requerido', 'VALIDATION_ERROR');

    const { data: booking, error } = await client
      .from('bookings').select('id, status, room_id').eq('id', body.booking_id).single();
    if (error || !booking) return errorResponse('Reserva no encontrada', 'NOT_FOUND', 404);
    if (booking.status !== 'en_curso') {
      return errorResponse('La reserva no esta en curso', 'CONFLICT', 409);
    }

    // 1. Crear primero la orden de limpieza. Si esto falla, abortamos el
    // checkout para que room/booking no queden en estado inconsistente.
    let cleaningOrderId: number | null = null;
    const { data: cleaningId, error: cleaningErr } = await client.rpc('create_cleaning_order', {
      p_room_id: booking.room_id,
      p_booking_id: booking.id,
      p_notas: body.notas_limpieza ?? null,
    });
    if (cleaningErr) {
      return errorResponse(
        `No se pudo crear la orden de limpieza: ${cleaningErr.message}`,
        'INTERNAL_ERROR',
        500,
      );
    }
    if (cleaningId) cleaningOrderId = Number(cleaningId);

    // 2. Marcar check_in salido, booking finalizada, room en limpieza.
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
      after: { status: 'finalizada', cleaning_order_id: cleaningOrderId },
    });

    return jsonResponse({
      success: true,
      data: { booking_id: booking.id, room_id: booking.room_id, cleaning_order_id: cleaningOrderId },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : 'Error', 'INTERNAL_ERROR', 500);
  }
});
