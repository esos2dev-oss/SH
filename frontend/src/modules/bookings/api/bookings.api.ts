import { supabase, invokeFunction } from '../../../shared/lib/supabase';
import { cached } from '../../../shared/lib/cached';
import type { PaginatedResponse } from '../../../shared/api/client';

export type BookingPeriod = 'dia' | 'semana' | 'mes';
export type BookingStatus = 'pendiente' | 'confirmada' | 'en_curso' | 'finalizada' | 'cancelada' | 'no_show';

export interface Booking {
  id: number; codigo: string; period: BookingPeriod;
  fecha_entrada: string; fecha_salida: string; huespedes: number;
  tarifa_aplicada: number; descuento_pct: number; descuento_monto: number;
  importe_total: number; importe_pagado: number; importe_pendiente: number;
  moneda: string;
  payment_status: 'pendiente' | 'parcial' | 'pagado' | 'reembolsado';
  status: BookingStatus; origen: string; notas: string | null;
  vehicle_plate: string | null;
  desayunos_extra: number;
  cancelled_at: string | null; cancelled_reason: string | null;
  customer: { id: number; nombre: string; email: string | null };
  room: { id: number; numero: string; planta: string | null; type: string };
  created_by: string; created_at: string; updated_at: string;
}

export interface AvailabilityRoom {
  id: number; numero: string; planta: string | null; room_type: string;
  tarifa_dia: number; tarifa_semana: number; tarifa_mes: number;
  capacidad: number;
}

export async function listBookings(params?: {
  status?: BookingStatus; customer_id?: number; room_id?: number; period?: BookingPeriod;
  dateFrom?: string; dateTo?: string; search?: string; page?: number; limit?: number;
}): Promise<PaginatedResponse<Booking[]>> {
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Orden: por creacion DESC (las reservas mas nuevas arriba, "orden de reservacion")
  let q = supabase.from('bookings_with_relations').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
  if (params?.status)       q = q.eq('status', params.status);
  if (params?.period)       q = q.eq('period', params.period);
  if (params?.dateFrom)     q = q.gte('fecha_entrada', params.dateFrom);
  if (params?.dateTo)       q = q.lte('fecha_salida', params.dateTo);
  // Buscar en codigo, nombre huesped y numero de habitacion (via campos JSONB de la view)
  if (params?.search) {
    const s = params.search.trim();
    q = q.or(`codigo.ilike.%${s}%,customer->>nombre.ilike.%${s}%,room->>numero.ilike.%${s}%`);
  }

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as Booking[];
  if (params?.customer_id) rows = rows.filter((b) => b.customer.id === params.customer_id);
  if (params?.room_id)     rows = rows.filter((b) => b.room.id === params.room_id);

  return {
    data: rows,
    pagination: { total: count ?? rows.length, page, limit, totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)) },
  };
}

export async function getBooking(id: number): Promise<Booking> {
  const { data, error } = await supabase.from('bookings_with_relations').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as Booking;
}

export async function calendarBookings(dateFrom: string, dateTo: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings_with_relations').select('*')
    .lt('fecha_entrada', dateTo).gt('fecha_salida', dateFrom);
  if (error) throw new Error(error.message);
  return (data ?? []) as Booking[];
}

type RoomWithType = { id: number; numero: string; planta: string | null; room_type: { id: number; nombre: string; tarifa_dia: number; tarifa_semana: number; tarifa_mes: number; capacidad: number } | null };

// Cache de la lista de rooms activas — cambia muy raramente.
async function fetchActiveRooms(): Promise<RoomWithType[]> {
  return cached('rooms:active:with_type', 5 * 60_000, async () => {
    const { data, error } = await supabase.from('rooms')
      .select('id, numero, planta, room_type:room_types(id, nombre, tarifa_dia, tarifa_semana, tarifa_mes, capacidad)')
      .eq('active', true);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as RoomWithType[];
  });
}

export async function availability(params: { dateFrom: string; dateTo: string; room_type_id?: number; huespedes?: number }): Promise<AvailabilityRoom[]> {
  // Paralelizar: bookings ocupados y lista de rooms (esta ultima cacheada).
  // Antes: 2 queries secuenciales (~1-3s). Ahora: max(query1, query2) ~= 500ms
  // y a partir de la 2da carga la de rooms es instantanea desde cache.
  const [occupiedRes, rooms] = await Promise.all([
    supabase.from('bookings')
      .select('room_id')
      .lt('fecha_entrada', params.dateTo)
      .gt('fecha_salida', params.dateFrom)
      .in('status', ['pendiente','confirmada','en_curso']),
    fetchActiveRooms(),
  ]);
  if (occupiedRes.error) throw new Error(occupiedRes.error.message);
  const occupiedIds = new Set((occupiedRes.data ?? []).map((r) => r.room_id));

  return rooms
    .filter((r) => !occupiedIds.has(r.id))
    .filter((r) => !params.room_type_id || r.room_type?.id === params.room_type_id)
    .map((r) => ({
      id: r.id, numero: r.numero, planta: r.planta,
      room_type: r.room_type?.nombre ?? '',
      tarifa_dia: Number(r.room_type?.tarifa_dia ?? 0),
      tarifa_semana: Number(r.room_type?.tarifa_semana ?? 0),
      tarifa_mes: Number(r.room_type?.tarifa_mes ?? 0),
      capacidad: Number(r.room_type?.capacidad ?? 0),
    }));
}

export async function createBooking(data: {
  customer_id: number; room_id: number; period: BookingPeriod;
  fecha_entrada: string; fecha_salida: string; huespedes?: number;
  descuento_pct?: number; descuento_monto?: number;
  desayunos_extra?: number;
  vehicle_plate?: string | null;
  notas?: string | null;
}): Promise<Booking> {
  const created = await invokeFunction<{ id: number }>('booking-create', data as unknown as Record<string, unknown>);
  return getBooking(created.id);
}

export async function updateBooking(id: number, data: { huespedes?: number; notas?: string | null }): Promise<Booking> {
  const patch: Record<string, unknown> = {};
  if (data.huespedes !== undefined) patch.huespedes = data.huespedes;
  if (data.notas !== undefined) patch.notas = data.notas;
  const { error } = await supabase.from('bookings').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  return getBooking(id);
}

export async function confirmBooking(id: number): Promise<Booking> {
  // Politica: solo se confirma si hay >= 50% pagado (importe_pagado real, no promesas).
  const current = await getBooking(id);
  const minRequired = current.importe_total * 0.5;
  if (current.importe_pagado + 0.01 < minRequired) {
    throw new Error(`No se puede confirmar sin al menos 50% pagado. Pagado: ${current.importe_pagado.toFixed(2)} · Minimo: ${minRequired.toFixed(2)}. Registra un pago antes.`);
  }
  const { error } = await supabase.from('bookings').update({ status: 'confirmada' }).eq('id', id);
  if (error) throw new Error(error.message);
  return getBooking(id);
}

export async function cancelBooking(id: number, reason: string): Promise<Booking> {
  const { error } = await supabase.from('bookings').update({
    status: 'cancelada',
    cancelled_at: new Date().toISOString(),
    cancelled_reason: reason,
  }).eq('id', id);
  if (error) throw new Error(error.message);
  return getBooking(id);
}

export async function noShowBooking(id: number): Promise<Booking> {
  const { error } = await supabase.from('bookings').update({ status: 'no_show' }).eq('id', id);
  if (error) throw new Error(error.message);
  return getBooking(id);
}

export async function moveBooking(id: number, data: { room_id?: number; fecha_entrada?: string; fecha_salida?: string }): Promise<Booking> {
  const patch: Record<string, unknown> = {};
  if (data.room_id !== undefined)        patch.room_id = data.room_id;
  if (data.fecha_entrada !== undefined)  patch.fecha_entrada = data.fecha_entrada;
  if (data.fecha_salida !== undefined)   patch.fecha_salida = data.fecha_salida;
  const { error } = await supabase.from('bookings').update(patch).eq('id', id);
  if (error) {
    // 23P01 = exclusion_violation (solapamiento con otra reserva)
    if ((error as { code?: string }).code === '23P01') {
      throw new Error('La habitacion ya tiene una reserva en ese rango. Cambia las fechas o elige otra habitacion.');
    }
    throw new Error(error.message);
  }
  return getBooking(id);
}
