// Edge Function: booking-create
// -------------------------------------------------------------------------
// POST /functions/v1/booking-create
// Body: { customer_id, room_id, period, fecha_entrada, fecha_salida,
//         huespedes, descuento_pct?, descuento_monto?, notas? }
//
// Responsabilidades (no se pueden expresar solo con RLS+PostgREST):
//  1. Leer tarifa segun room_type.period
//  2. Calcular unidades (dias/semanas/meses)
//  3. Calcular importe_total = tarifa * unidades - descuentos
//  4. Validar no-solapamiento (lo hace el EXCLUDE constraint, lo dejamos como guard)
//  5. Generar codigo legible BK-YYYY-NNNN
//  6. Insertar booking en una transaccion
//
// Auth: requiere JWT valido y rol recepcion+admin+superadmin (lo refuerza RLS).

import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/supabase.ts';

interface BookingInput {
  customer_id: number;
  room_id: number;
  period: 'dia' | 'semana' | 'mes';
  fecha_entrada: string;
  fecha_salida: string;
  huespedes?: number;
  descuento_pct?: number;
  descuento_monto?: number;
  notas?: string;
}

function unidades(period: string, entrada: Date, salida: Date): number {
  const ms = salida.getTime() - entrada.getTime();
  const dias = Math.ceil(ms / 86400000);
  if (period === 'dia') return dias;
  if (period === 'semana') return Math.max(1, Math.ceil(dias / 7));
  if (period === 'mes') return Math.max(1, Math.ceil(dias / 30));
  throw new Error('Periodo invalido');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Metodo no permitido', 'METHOD_NOT_ALLOWED', 405);

  try {
    const { client, user } = await requireUser(req);
    const body = (await req.json()) as BookingInput;

    if (!body.customer_id || !body.room_id || !body.period || !body.fecha_entrada || !body.fecha_salida) {
      return errorResponse('Faltan campos requeridos', 'VALIDATION_ERROR');
    }

    const entrada = new Date(body.fecha_entrada);
    const salida = new Date(body.fecha_salida);
    if (!(salida > entrada)) return errorResponse('fecha_salida debe ser posterior a fecha_entrada', 'VALIDATION_ERROR');

    // 1. Leer room + room_type
    const { data: room, error: roomErr } = await client
      .from('rooms')
      .select('id, room_type_id, room_types(tarifa_dia, tarifa_semana, tarifa_mes, moneda)')
      .eq('id', body.room_id)
      .single();
    if (roomErr || !room) return errorResponse('Habitacion no encontrada', 'NOT_FOUND', 404);

    // deno-lint-ignore no-explicit-any
    const rt = (room as any).room_types;
    const tarifaPorPeriodo: Record<string, number> = {
      dia: rt.tarifa_dia,
      semana: rt.tarifa_semana,
      mes: rt.tarifa_mes,
    };
    const tarifa = tarifaPorPeriodo[body.period];
    if (tarifa == null) return errorResponse('La habitacion no tiene tarifa para ese periodo', 'VALIDATION_ERROR');

    const u = unidades(body.period, entrada, salida);
    const subtotal = Number(tarifa) * u;
    const descuentoPct = Number(body.descuento_pct ?? 0);
    const descuentoMonto = Number(body.descuento_monto ?? 0);
    const total = Math.max(0, subtotal - (subtotal * descuentoPct) / 100 - descuentoMonto);

    // 2. Generar codigo
    const { data: codigoData, error: codigoErr } = await client.rpc('next_code', { p_prefix: 'BK' });
    if (codigoErr || !codigoData) return errorResponse('No se pudo generar codigo', 'INTERNAL_ERROR', 500);

    // 3. Insertar booking (RLS valida el rol; EXCLUDE constraint valida no-solapamiento)
    const { data: booking, error: insErr } = await client
      .from('bookings')
      .insert({
        codigo: codigoData,
        customer_id: body.customer_id,
        room_id: body.room_id,
        period: body.period,
        fecha_entrada: body.fecha_entrada,
        fecha_salida: body.fecha_salida,
        huespedes: body.huespedes ?? 1,
        tarifa_aplicada: tarifa,
        descuento_pct: descuentoPct,
        descuento_monto: descuentoMonto,
        importe_total: total,
        moneda: rt.moneda,
        status: 'pendiente',
        payment_status: 'pendiente',
        notas: body.notas,
        created_by: user.id,
      })
      .select()
      .single();

    if (insErr) {
      // 23P01 = exclusion_violation (solapamiento)
      if (insErr.code === '23P01') {
        return errorResponse('La habitacion ya tiene una reserva en ese rango', 'CONFLICT', 409);
      }
      return errorResponse(insErr.message, 'INTERNAL_ERROR', 500);
    }

    return jsonResponse({ success: true, data: booking });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : 'Error', 'INTERNAL_ERROR', 500);
  }
});
