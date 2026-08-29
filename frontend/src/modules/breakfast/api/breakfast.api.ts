import { supabase } from '../../../shared/lib/supabase';

export interface BreakfastOrder {
  id: number;
  booking_id: number;
  fecha: string;                 // YYYY-MM-DD
  cantidad: number;
  precio_unitario: number;
  total: number;
  moneda: string;
  notas: string | null;
  entregado: boolean;
  entregado_at: string | null;
  entregado_by: string | null;
  pagado_a_restaurante: boolean;
  pagado_a_restaurante_at: string | null;
  pagado_a_restaurante_by: string | null;
  ledger_entry_id: number | null;
  creado_by: string | null;
  created_at: string;
  updated_at: string;
  booking_codigo?: string;
  fecha_entrada?: string;
  fecha_salida?: string;
  booking_status?: string;
  customer?: { id: number; nombre: string; telefono: string | null };
  room?: { id: number; numero: string };
}

export interface BreakfastSummary {
  fecha: string;
  total_desayunos: number;
  total_entregados: number;
  total_pendientes: number;
  ingreso_total: number;
  moneda: string;
  habitaciones_count: number;
}

export async function listByDate(fecha: string): Promise<BreakfastOrder[]> {
  const { data, error } = await supabase.from('breakfast_orders_view')
    .select('*').eq('fecha', fecha).order('room->>numero');
  if (error) throw new Error(error.message);
  return (data ?? []) as BreakfastOrder[];
}

export async function summaryByDate(fecha: string): Promise<BreakfastSummary> {
  const { data, error } = await supabase.rpc('breakfast_daily_summary', { p_fecha: fecha });
  if (error) throw new Error(error.message);
  return data as BreakfastSummary;
}

export interface BrutoNetoSummary {
  from: string; to: string;
  ingreso_bruto: number;
  costo_restaurante: number;
  ingreso_neto: number;
  pendiente_pagar_restaurante: number;
  count_entregados: number;
  count_pagados_al_restaurante: number;
  moneda: string;
}

export async function brutoNeto(from: string, to: string): Promise<BrutoNetoSummary> {
  const { data, error } = await supabase.rpc('breakfast_bruto_neto', { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return data as BrutoNetoSummary;
}

export async function pagarAlRestaurante(from: string, to: string, notas?: string): Promise<{ ok: boolean; ledger_entry_id?: number; ledger_codigo?: string; total?: number; moneda?: string; orders_count?: number; reason?: string }> {
  const { data, error } = await supabase.rpc('pagar_desayunos_a_restaurante', { p_from: from, p_to: to, p_moneda: 'EUR', p_notas: notas ?? null });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; ledger_entry_id?: number; ledger_codigo?: string; total?: number; moneda?: string; orders_count?: number; reason?: string };
}

export async function upsertOrder(data: {
  booking_id: number; fecha: string; cantidad: number; precio_unitario: number; notas?: string | null;
}): Promise<BreakfastOrder> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { data: row, error } = await supabase.from('breakfast_orders').upsert({
    booking_id: data.booking_id,
    fecha: data.fecha,
    cantidad: data.cantidad,
    precio_unitario: data.precio_unitario,
    notas: data.notas ?? null,
    creado_by: user.id,
    moneda: 'EUR',
  }, { onConflict: 'booking_id,fecha' }).select('*').single();
  if (error) throw new Error(error.message);
  return row as BreakfastOrder;
}

export async function markDelivered(id: number, delivered: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('breakfast_orders').update({
    entregado: delivered,
    entregado_at: delivered ? new Date().toISOString() : null,
    entregado_by: delivered ? user?.id ?? null : null,
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteOrder(id: number): Promise<void> {
  const { error } = await supabase.from('breakfast_orders').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Helper: obtener reservas activas hoy para poder añadir desayunos rápido
export async function activeBookingsToday(fecha: string): Promise<Array<{ id: number; codigo: string; huespedes: number; room_numero: string; customer_nombre: string }>> {
  const { data, error } = await supabase.from('bookings_with_relations')
    .select('id, codigo, huespedes, customer, room, fecha_entrada, fecha_salida, status')
    .in('status', ['confirmada','en_curso'])
    .lte('fecha_entrada', fecha + 'T23:59:59')
    .gte('fecha_salida', fecha + 'T00:00:00');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: number; codigo: string; huespedes: number; customer: { nombre: string }; room: { numero: string } }>)
    .map((b) => ({ id: b.id, codigo: b.codigo, huespedes: b.huespedes, room_numero: b.room.numero, customer_nombre: b.customer.nombre }));
}
