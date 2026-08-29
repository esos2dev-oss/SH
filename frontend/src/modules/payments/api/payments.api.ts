// Payments API contra Supabase puro.
// Algunas operaciones complejas (statement, auto-conciliacion bancaria, cierre
// de caja) quedan como stubs simplificados — la logica completa volvera cuando
// se promuevan a Postgres functions/edge functions.

import { supabase } from '../../../shared/lib/supabase';
import { cached, invalidate } from '../../../shared/lib/cached';
import type { PaginatedResponse } from '../../../shared/api/client';

export type PaymentMethod =
  | 'efectivo' | 'tarjeta' | 'transferencia' | 'paypal' | 'otro'
  | 'pago_movil' | 'zelle' | 'punto_venta' | 'efectivo_usd' | 'efectivo_bs';

export type PaymentStatus = 'pending_confirmation' | 'confirmed' | 'rejected';

export interface PaymentPublic {
  id: number;
  booking: { id: number; codigo: string; status: string } | null;
  customer: { id: number; nombre: string; telefono: string | null; doc_numero: string | null } | null;
  monto: number;
  moneda: string;
  monto_base: number | null;
  tasa_cambio: number | null;
  method: PaymentMethod;
  method_details: Record<string, unknown>;
  referencia: string | null;
  pagado_at: string;
  status: PaymentStatus;
  registered_by: string;
  confirmed_at: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  ledger_entry_id: number | null;
  bank_match_id: number | null;
  receipt_url: string | null;
  receipt_mime: string | null;
  notas: string | null;
  created_at: string;
}

export interface QuickLookupItem {
  kind: 'booking' | 'customer';
  id: number;
  label: string;
  hint: string;
  booking_id: number | null;
  customer_id: number | null;
  room_numero: string | null;
  importe_pendiente: number;
  moneda: string | null;
}

export interface CreatePaymentInput {
  booking_id?: number | null;
  customer_id?: number | null;
  monto: number;
  moneda: string;
  tasa_cambio?: number | null;
  method: PaymentMethod;
  method_details?: Record<string, unknown>;
  referencia?: string | null;
  pagado_at?: string;
  notas?: string | null;
  receipt_url?: string | null;
  receipt_mime?: string | null;
  force_status?: PaymentStatus;
}

export interface StatementLine {
  kind: 'charge' | 'payment';
  id: number | string;
  fecha: string;
  descripcion: string;
  monto: number;
  moneda: string;
  method?: PaymentMethod;
  status?: PaymentStatus;
  referencia?: string | null;
}

export interface StatementSummary {
  moneda: string;
  total_cargos: number;
  total_pagado_confirmado: number;
  total_pagado_pendiente: number;
  saldo: number;
  saldo_efectivo: number;
}

export interface BookingStatement {
  booking: { id: number; codigo: string; status: string; fecha_entrada: string; fecha_salida: string; importe_total: number; moneda: string };
  customer: { id: number; nombre: string; telefono: string | null };
  lines: StatementLine[];
  summary: StatementSummary;
}

export interface CustomerStatement {
  customer: { id: number; nombre: string; telefono: string | null; doc_numero: string | null };
  bookings: Array<{
    booking: { id: number; codigo: string; status: string; fecha_entrada: string; fecha_salida: string };
    summary: StatementSummary;
    lines: StatementLine[];
  }>;
  loose_payments: PaymentPublic[];
  totals: StatementSummary;
}

export interface ExchangeRate {
  fecha: string;
  bs_per_usd: number;
  bs_per_eur: number | null;
  source: 'manual' | 'bcv';
}

const PAYMENT_COLUMNS = `
  id, monto, moneda, monto_base, tasa_cambio, method, method_details, referencia,
  pagado_at, status, registered_by, confirmed_at, rejected_at, rejected_reason,
  ledger_entry_id, bank_match_id, receipt_url, receipt_mime, notas, created_at,
  booking:bookings ( id, codigo, status ),
  customer:customers ( id, nombres, apellidos, telefono, doc_numero )
`;

function mapPayment(row: Record<string, unknown>): PaymentPublic {
  const c = row.customer as { id: number; nombres: string; apellidos: string; telefono: string | null; doc_numero: string | null } | null;
  return {
    ...(row as Omit<PaymentPublic, 'customer'>),
    customer: c ? { id: c.id, nombre: `${c.nombres} ${c.apellidos}`, telefono: c.telefono, doc_numero: c.doc_numero } : null,
  } as PaymentPublic;
}

export async function listPayments(params?: {
  status?: PaymentStatus; method?: PaymentMethod;
  booking_id?: number; customer_id?: number; search?: string;
  dateFrom?: string; dateTo?: string; page?: number; limit?: number;
}): Promise<PaginatedResponse<PaymentPublic[]>> {
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  let q = supabase.from('booking_payments').select(PAYMENT_COLUMNS, { count: 'exact' }).order('pagado_at', { ascending: false }).range(from, to);
  if (params?.status) q = q.eq('status', params.status);
  if (params?.method) q = q.eq('method', params.method);
  if (params?.booking_id) q = q.eq('booking_id', params.booking_id);
  if (params?.customer_id) q = q.eq('customer_id', params.customer_id);
  if (params?.search) q = q.ilike('referencia', `%${params.search}%`);
  if (params?.dateFrom) q = q.gte('pagado_at', params.dateFrom);
  if (params?.dateTo) q = q.lte('pagado_at', params.dateTo);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return {
    data: ((data ?? []) as Record<string, unknown>[]).map(mapPayment),
    pagination: { total: count ?? 0, page, limit, totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)) },
  };
}

export async function getPayment(id: number): Promise<PaymentPublic> {
  const { data, error } = await supabase.from('booking_payments').select(PAYMENT_COLUMNS).eq('id', id).single();
  if (error) throw new Error(error.message);
  return mapPayment(data as Record<string, unknown>);
}

export async function lookupQuick(q: string): Promise<QuickLookupItem[]> {
  // Busca bookings y customers que matcheen el query.
  const [{ data: bookings }, { data: customers }] = await Promise.all([
    supabase.from('bookings_with_relations').select('id, codigo, customer, room, importe_total, importe_pagado, moneda').or(`codigo.ilike.%${q}%`).limit(5),
    supabase.from('customers_with_stats').select('id, nombres, apellidos, doc_numero, telefono').or(`nombres.ilike.%${q}%,apellidos.ilike.%${q}%,doc_numero.ilike.%${q}%`).limit(5),
  ]);
  const items: QuickLookupItem[] = [];
  for (const b of (bookings ?? []) as Record<string, unknown>[]) {
    const customer = b.customer as { id: number; nombre: string };
    const room = b.room as { numero: string };
    items.push({
      kind: 'booking',
      id: b.id as number,
      label: `${b.codigo} — ${customer.nombre}`,
      hint: `Hab ${room.numero}`,
      booking_id: b.id as number,
      customer_id: customer.id,
      room_numero: room.numero,
      importe_pendiente: Number(b.importe_total) - Number(b.importe_pagado),
      moneda: b.moneda as string,
    });
  }
  for (const c of (customers ?? []) as Record<string, unknown>[]) {
    items.push({
      kind: 'customer',
      id: c.id as number,
      label: `${c.nombres} ${c.apellidos}`,
      hint: String(c.doc_numero ?? ''),
      booking_id: null, customer_id: c.id as number, room_numero: null,
      importe_pendiente: 0, moneda: null,
    });
  }
  return items;
}

export async function createPayment(data: CreatePaymentInput): Promise<PaymentPublic> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  // Politica del hotel: todos los pagos se registran confirmados. Se elimino
  // el flujo "por confirmar" — si un pago se ingresa es porque ya se verifico.
  const status: PaymentStatus = 'confirmed';
  const now = new Date().toISOString();
  const isConfirmed = true;
  const { data: row, error } = await supabase.from('booking_payments').insert({
    booking_id: data.booking_id ?? null,
    customer_id: data.customer_id ?? null,
    monto: data.monto,
    moneda: data.moneda,
    tasa_cambio: data.tasa_cambio ?? null,
    method: data.method,
    method_details: data.method_details ?? {},
    referencia: data.referencia ?? null,
    pagado_at: data.pagado_at ?? now,
    receipt_url: data.receipt_url ?? null,
    receipt_mime: data.receipt_mime ?? null,
    notas: data.notas ?? null,
    status,
    registered_by: user.id,
    confirmed_at: isConfirmed ? now : null,
    confirmed_by: isConfirmed ? user.id : null,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return getPayment((row as { id: number }).id);
}

export async function updatePayment(id: number, data: { notas?: string | null; referencia?: string | null; receipt_url?: string | null; receipt_mime?: string | null }): Promise<PaymentPublic> {
  const patch: Record<string, unknown> = {};
  if (data.notas !== undefined) patch.notas = data.notas;
  if (data.referencia !== undefined) patch.referencia = data.referencia;
  if (data.receipt_url !== undefined) patch.receipt_url = data.receipt_url;
  if (data.receipt_mime !== undefined) patch.receipt_mime = data.receipt_mime;
  const { error } = await supabase.from('booking_payments').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  return getPayment(id);
}

export async function confirmPayment(id: number): Promise<PaymentPublic> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { error } = await supabase.from('booking_payments').update({
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    confirmed_by: user.id,
  }).eq('id', id);
  if (error) throw new Error(error.message);
  return getPayment(id);
}

export async function rejectPayment(id: number, reason: string): Promise<PaymentPublic> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { error } = await supabase.from('booking_payments').update({
    status: 'rejected',
    rejected_at: new Date().toISOString(),
    rejected_by: user.id,
    rejected_reason: reason,
  }).eq('id', id);
  if (error) throw new Error(error.message);
  return getPayment(id);
}

export async function getBookingStatement(bookingId: number): Promise<BookingStatement> {
  const { data: bk, error: e1 } = await supabase.from('bookings_with_relations').select('*').eq('id', bookingId).single();
  if (e1) throw new Error(e1.message);
  const { data: payments } = await supabase.from('booking_payments').select(PAYMENT_COLUMNS).eq('booking_id', bookingId).order('pagado_at');

  const lines: StatementLine[] = [];
  // Cargo de la reserva
  lines.push({
    kind: 'charge', id: `bk-${bk.id}`, fecha: bk.fecha_entrada,
    descripcion: `Reserva ${bk.codigo}`, monto: Number(bk.importe_total), moneda: bk.moneda,
  });
  let totalConfirmado = 0, totalPendiente = 0;
  for (const p of ((payments ?? []) as Record<string, unknown>[]).map(mapPayment)) {
    lines.push({
      kind: 'payment', id: p.id, fecha: p.pagado_at,
      descripcion: `Pago ${p.method}${p.referencia ? ' #' + p.referencia : ''}`,
      monto: -Number(p.monto), moneda: p.moneda,
      method: p.method, status: p.status, referencia: p.referencia,
    });
    if (p.status === 'confirmed') totalConfirmado += Number(p.monto);
    else if (p.status === 'pending_confirmation') totalPendiente += Number(p.monto);
  }
  const total_cargos = Number(bk.importe_total);
  const saldo = total_cargos - totalConfirmado - totalPendiente;
  const saldo_efectivo = total_cargos - totalConfirmado;

  return {
    booking: { id: bk.id, codigo: bk.codigo, status: bk.status, fecha_entrada: bk.fecha_entrada, fecha_salida: bk.fecha_salida, importe_total: total_cargos, moneda: bk.moneda },
    customer: { id: bk.customer.id, nombre: bk.customer.nombre, telefono: bk.customer.telefono ?? null },
    lines,
    summary: { moneda: bk.moneda, total_cargos, total_pagado_confirmado: totalConfirmado, total_pagado_pendiente: totalPendiente, saldo, saldo_efectivo },
  };
}

export async function getCustomerStatement(customerId: number): Promise<CustomerStatement> {
  const { data: c, error } = await supabase.from('customers_with_stats').select('*').eq('id', customerId).single();
  if (error) throw new Error(error.message);
  const { data: bks } = await supabase.from('bookings_with_relations').select('*').eq('customer->>id', String(customerId)).order('fecha_entrada', { ascending: false });

  const bookings: CustomerStatement['bookings'] = [];
  let total_cargos = 0, total_conf = 0, total_pend = 0;
  for (const b of (bks ?? []) as Array<{ id: number; codigo: string; status: string; fecha_entrada: string; fecha_salida: string; importe_total: number; importe_pagado: number; moneda: string }>) {
    const st = await getBookingStatement(b.id);
    bookings.push({ booking: { id: b.id, codigo: b.codigo, status: b.status, fecha_entrada: b.fecha_entrada, fecha_salida: b.fecha_salida }, summary: st.summary, lines: st.lines });
    total_cargos += st.summary.total_cargos;
    total_conf += st.summary.total_pagado_confirmado;
    total_pend += st.summary.total_pagado_pendiente;
  }

  const { data: loose } = await supabase.from('booking_payments').select(PAYMENT_COLUMNS).eq('customer_id', customerId).is('booking_id', null);

  return {
    customer: { id: c.id, nombre: `${c.nombres} ${c.apellidos}`, telefono: c.telefono ?? null, doc_numero: c.doc_numero ?? null },
    bookings,
    loose_payments: ((loose ?? []) as Record<string, unknown>[]).map(mapPayment),
    totals: { moneda: 'USD', total_cargos, total_pagado_confirmado: total_conf, total_pagado_pendiente: total_pend, saldo: total_cargos - total_conf - total_pend, saldo_efectivo: total_cargos - total_conf },
  };
}

export async function getCurrentRate(): Promise<ExchangeRate | null> {
  // Cache 10 min. La tasa BCV se fija una vez al dia.
  return cached('exchange_rate:current', 10 * 60_000, async () => {
    const { data } = await supabase.from('exchange_rates').select('*').order('fecha', { ascending: false }).limit(1).maybeSingle();
    return data as ExchangeRate | null;
  });
}

export async function listRates(): Promise<ExchangeRate[]> {
  const { data, error } = await supabase.from('exchange_rates').select('*').order('fecha', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExchangeRate[];
}

export async function upsertRate(data: { fecha?: string; bs_per_usd: number; bs_per_eur?: number | null; source?: 'manual' | 'bcv' }): Promise<ExchangeRate> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const payload: Record<string, unknown> = {
    fecha: data.fecha ?? new Date().toISOString().slice(0, 10),
    bs_per_usd: data.bs_per_usd,
    source: data.source ?? 'manual',
    set_by: user.id,
  };
  if (data.bs_per_eur !== undefined) payload.bs_per_eur = data.bs_per_eur;
  const { data: row, error } = await supabase.from('exchange_rates').upsert(payload).select('*').single();
  if (error) throw new Error(error.message);
  invalidate('exchange_rate:current');
  return row as ExchangeRate;
}

// Sincroniza tasa BCV (USD + EUR) llamando a edge function que consulta ve.dolarapi.com.
export async function syncBcvRate(): Promise<ExchangeRate> {
  const { data, error } = await supabase.functions.invoke<{ success: boolean; data?: ExchangeRate; error?: string }>('sync-bcv-rate', { body: {} });
  if (error) throw new Error(error.message);
  if (!data?.success || !data.data) throw new Error(data?.error ?? 'Error sync BCV');
  invalidate('exchange_rate:current');
  return data.data;
}

export async function uploadReceipt(file: File): Promise<{ url: string; mime: string; size: number }> {
  const path = `payments/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return { url: path, mime: file.type, size: file.size };
}
