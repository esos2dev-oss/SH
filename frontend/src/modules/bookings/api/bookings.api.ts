import { supabase, invokeFunction } from '../../../shared/lib/supabase';
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
  cancelled_at: string | null; cancelled_reason: string | null;
  customer: { id: number; nombre: string; email: string | null };
  room: { id: number; numero: string; planta: string | null; type: string };
  created_by: string; created_at: string; updated_at: string;
}

export interface AvailabilityRoom {
  id: number; numero: string; planta: string | null; room_type: string; tarifa_dia: number;
}

export async function listBookings(params?: {
  status?: BookingStatus; customer_id?: number; room_id?: number; period?: BookingPeriod;
  dateFrom?: string; dateTo?: string; search?: string; page?: number; limit?: number;
}): Promise<PaginatedResponse<Booking[]>> {
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase.from('bookings_with_relations').select('*', { count: 'exact' }).order('fecha_entrada', { ascending: false }).range(from, to);
  if (params?.status)       q = q.eq('status', params.status);
  if (params?.period)       q = q.eq('period', params.period);
  if (params?.dateFrom)     q = q.gte('fecha_entrada', params.dateFrom);
  if (params?.dateTo)       q = q.lte('fecha_salida', params.dateTo);
  if (params?.search)       q = q.ilike('codigo', `%${params.search}%`);

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

export async function availability(params: { dateFrom: string; dateTo: string; room_type_id?: number; huespedes?: number }): Promise<AvailabilityRoom[]> {
  const { data: occupied, error: e1 } = await supabase
    .from('bookings')
    .select('room_id')
    .lt('fecha_entrada', params.dateTo)
    .gt('fecha_salida', params.dateFrom)
    .in('status', ['pendiente','confirmada','en_curso']);
  if (e1) throw new Error(e1.message);
  const occupiedIds = (occupied ?? []).map((r) => r.room_id);

  let q = supabase.from('rooms').select('id, numero, planta, room_type:room_types(id, nombre, tarifa_dia, capacidad)').eq('active', true);
  if (occupiedIds.length) q = q.not('id', 'in', `(${occupiedIds.join(',')})`);
  if (params.room_type_id) q = q.eq('room_type_id', params.room_type_id);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  type Row = { id: number; numero: string; planta: string | null; room_type: { nombre: string; tarifa_dia: number; capacidad: number } | null };
  const rows = (data ?? []) as unknown as Row[];
  return rows
    .filter((r) => !params.huespedes || (r.room_type?.capacidad ?? 0) >= params.huespedes)
    .map((r) => ({ id: r.id, numero: r.numero, planta: r.planta, room_type: r.room_type?.nombre ?? '', tarifa_dia: Number(r.room_type?.tarifa_dia ?? 0) }));
}

export async function createBooking(data: {
  customer_id: number; room_id: number; period: BookingPeriod;
  fecha_entrada: string; fecha_salida: string; huespedes?: number;
  descuento_pct?: number; descuento_monto?: number; notas?: string | null;
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
  if (error) throw new Error(error.message);
  return getBooking(id);
}
