// Edge Function: booking-checkin
// POST /functions/v1/booking-checkin
// Body: { booking_id, documento_url?, firma_url?, huespedes_acompaniantes?, observaciones? }
//
// Reglas:
//  - booking debe estar en estado pendiente/confirmada
//  - habitacion debe estar en estado disponible o limpieza
//  - Tras check-in: booking.status = 'en_curso', room.status = 'ocupada'
//  - Registra entrada en audit_log

import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/supabase.ts';

interface CheckInInput {
  booking_id: number;
  documento_url?: string;
  firma_url?: string;
  huespedes_acompaniantes?: unknown[];
  observaciones?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Metodo no permitido', 'METHOD_NOT_ALLOWED', 405);

  try {
    const { client, user } = await requireUser(req);
    const body = (await req.json()) as CheckInInput;

    if (!body.booking_id) return errorResponse('booking_id requerido', 'VALIDATION_ERROR');

    const { data: booking, error: bErr } = await client
      .from('bookings').select('id, status, room_id').eq('id', body.booking_id).single();
    if (bErr || !booking) return errorResponse('Reserva no encontrada', 'NOT_FOUND', 404);
    if (!['pendiente', 'confirmada'].includes(booking.status)) {
      return errorResponse('La reserva no esta en estado valido para check-in', 'CONFLICT', 409);
    }

    // 1) Crear check_in
    const { data: ci, error: ciErr } = await client.from('check_ins').insert({
      booking_id: booking.id,
      documento_url: body.documento_url,
      firma_url: body.firma_url,
      huespedes_acompaniantes: body.huespedes_acompaniantes ?? [],
      observaciones: body.observaciones,
      registered_by: user.id,
    }).select().single();
    if (ciErr) return errorResponse(ciErr.message, 'INTERNAL_ERROR', 500);

    // 2) booking -> en_curso
    await client.from('bookings').update({ status: 'en_curso' }).eq('id', booking.id);

    // 3) room -> ocupada
    await client.from('rooms').update({ status: 'ocupada' }).eq('id', booking.room_id);

    // 4) audit
    await client.from('audit_log').insert({
      user_id: user.id,
      action: 'status_change',
      entity: 'booking',
      entity_id: String(booking.id),
      after: { status: 'en_curso', check_in_id: ci.id },
    });

    return jsonResponse({ success: true, data: ci });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : 'Error', 'INTERNAL_ERROR', 500);
  }
});
