// Payments API contra Supabase puro.
// Algunas operaciones complejas (statement, auto-conciliacion bancaria, cierre
// de caja) quedan como stubs simplificados — la logica completa volvera cuando
// se promuevan a Postgres functions/edge functions.

import { supabase, invokeFunction } from '../../../shared/lib/supabase';
import type { PaginatedResponse } from '../../../shared/api/client';
import { convertNumber, type RateSnapshot } from '../lib/currency';

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
  /** Equivalente en moneda base (USD). Null si no se pudo convertir. */
  monto_base?: number | null;
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
  /** Acumulado en moneda base, para auditar la conversion. */
  base_confirmado_usd?: number;
  /** Pagos que no se pudieron convertir por falta de tasa. Si es > 0, el total es incompleto. */
  pagos_sin_convertir?: number;
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
  /** Euros por 1 USD. Necesario para convertir cobros en EUR a la base. */
  eur_per_usd: number | null;
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
  const status: PaymentStatus = data.force_status ?? (data.method === 'pago_movil' || data.method === 'zelle' || data.method === 'transferencia' ? 'pending_confirmation' : 'confirmed');
  const { data: row, error } = await supabase.from('booking_payments').insert({
    booking_id: data.booking_id ?? null,
    customer_id: data.customer_id ?? null,
    monto: data.monto,
    moneda: data.moneda,
    tasa_cambio: data.tasa_cambio ?? null,
    method: data.method,
    method_details: data.method_details ?? {},
    referencia: data.referencia ?? null,
    pagado_at: data.pagado_at ?? new Date().toISOString(),
    receipt_url: data.receipt_url ?? null,
    receipt_mime: data.receipt_mime ?? null,
    notas: data.notas ?? null,
    status,
    registered_by: user.id,
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

export async function getBookingStatement(bookingId: number, rate?: RateSnapshot | null): Promise<BookingStatement> {
  const { data: bk, error: e1 } = await supabase.from('bookings_with_relations').select('*').eq('id', bookingId).single();
  if (e1) throw e1;
  const { data: payments } = await supabase.from('booking_payments').select(PAYMENT_COLUMNS).eq('booking_id', bookingId).order('pagado_at');
  const currentRate = rate !== undefined ? rate : await getCurrentRate();

  const lines: StatementLine[] = [];
  // Cargo de la reserva
  lines.push({
    kind: 'charge', id: `bk-${bk.id}`, fecha: bk.fecha_entrada,
    descripcion: `Reserva ${bk.codigo}`, monto: Number(bk.importe_total), moneda: bk.moneda,
  });

  // AQUI estaba el bug 1: se sumaba `p.monto` sin mirar `p.moneda`, asi que
  // 38 Bs + 38 EUR daba "76 EUR pagados" y la reserva quedaba saldada.
  //
  // Regla (identica a recalc_booking_payment_state en la BD): los cobros hechos
  // en la moneda de la reserva se suman tal cual; solo los de otra moneda pasan
  // por la base. Evita el ida y vuelta EUR->USD->EUR, que revaluaria reservas ya
  // saldadas cada vez que se mueve la tasa.
  const moneda = (bk.moneda as string).toUpperCase();
  let mismaConfirmado = 0, mismaPendiente = 0;
  let otrasBaseConfirmado = 0, otrasBasePendiente = 0;
  let baseConfirmado = 0;
  let sinConvertir = 0;

  for (const p of ((payments ?? []) as Record<string, unknown>[]).map(mapPayment)) {
    lines.push({
      kind: 'payment', id: p.id, fecha: p.pagado_at,
      descripcion: `Pago ${p.method}${p.referencia ? ' #' + p.referencia : ''}`,
      monto: -Number(p.monto), moneda: p.moneda,
      monto_base: p.monto_base === null ? null : Number(p.monto_base),
      method: p.method, status: p.status, referencia: p.referencia,
    });

    if (p.status !== 'confirmed' && p.status !== 'pending_confirmation') continue;

    const base = p.monto_base !== null && p.monto_base !== undefined
      ? Number(p.monto_base)
      : convertNumber(Number(p.monto), p.moneda, 'USD', currentRate);

    if (p.status === 'confirmed' && base !== null) baseConfirmado += base;

    if ((p.moneda ?? '').toUpperCase() === moneda) {
      if (p.status === 'confirmed') mismaConfirmado += Number(p.monto);
      else mismaPendiente += Number(p.monto);
      continue;
    }

    if (base === null) { sinConvertir++; continue; }
    if (p.status === 'confirmed') otrasBaseConfirmado += base;
    else otrasBasePendiente += base;
  }

  const totalConfirmado = mismaConfirmado + (convertNumber(otrasBaseConfirmado, 'USD', moneda, currentRate) ?? 0);
  const totalPendiente = mismaPendiente + (convertNumber(otrasBasePendiente, 'USD', moneda, currentRate) ?? 0);

  const total_cargos = Number(bk.importe_total);
  const saldo = round2(total_cargos - totalConfirmado - totalPendiente);
  const saldo_efectivo = round2(total_cargos - totalConfirmado);

  return {
    booking: { id: bk.id, codigo: bk.codigo, status: bk.status, fecha_entrada: bk.fecha_entrada, fecha_salida: bk.fecha_salida, importe_total: total_cargos, moneda },
    customer: { id: bk.customer.id, nombre: bk.customer.nombre, telefono: bk.customer.telefono ?? null },
    lines,
    summary: {
      moneda,
      total_cargos,
      total_pagado_confirmado: round2(totalConfirmado),
      total_pagado_pendiente: round2(totalPendiente),
      saldo,
      saldo_efectivo,
      base_confirmado_usd: round2(baseConfirmado),
      pagos_sin_convertir: sinConvertir,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getCustomerStatement(customerId: number): Promise<CustomerStatement> {
  const { data: c, error } = await supabase.from('customers_with_stats').select('*').eq('id', customerId).single();
  if (error) throw error;
  const { data: bks } = await supabase.from('bookings_with_relations').select('*').eq('customer->>id', String(customerId)).order('fecha_entrada', { ascending: false });
  // Una sola lectura de tasa para todo el estado de cuenta.
  const rate = await getCurrentRate();

  const bookings: CustomerStatement['bookings'] = [];
  // Los totales agregados de un cliente con reservas en distintas monedas SOLO
  // tienen sentido en la moneda base. Antes se sumaban en crudo y se etiquetaba
  // 'USD' a ojo, de ahi el "0 estancias · EUR 0,00" arriba y "USD 0,00" abajo.
  let base_cargos = 0, base_conf = 0, base_pend = 0;

  for (const b of (bks ?? []) as Array<{ id: number; codigo: string; status: string; fecha_entrada: string; fecha_salida: string; importe_total: number; importe_pagado: number; moneda: string }>) {
    const st = await getBookingStatement(b.id, rate);
    bookings.push({ booking: { id: b.id, codigo: b.codigo, status: b.status, fecha_entrada: b.fecha_entrada, fecha_salida: b.fecha_salida }, summary: st.summary, lines: st.lines });
    base_cargos += convertNumber(st.summary.total_cargos, st.summary.moneda, 'USD', rate) ?? 0;
    base_conf   += st.summary.base_confirmado_usd ?? 0;
    base_pend   += convertNumber(st.summary.total_pagado_pendiente, st.summary.moneda, 'USD', rate) ?? 0;
  }

  const { data: loose } = await supabase.from('booking_payments').select(PAYMENT_COLUMNS).eq('customer_id', customerId).is('booking_id', null);

  return {
    customer: { id: c.id, nombre: `${c.nombres} ${c.apellidos}`, telefono: c.telefono ?? null, doc_numero: c.doc_numero ?? null },
    bookings,
    loose_payments: ((loose ?? []) as Record<string, unknown>[]).map(mapPayment),
    totals: {
      moneda: 'USD',
      total_cargos: round2(base_cargos),
      total_pagado_confirmado: round2(base_conf),
      total_pagado_pendiente: round2(base_pend),
      saldo: round2(base_cargos - base_conf - base_pend),
      saldo_efectivo: round2(base_cargos - base_conf),
    },
  };
}

export async function getCurrentRate(): Promise<ExchangeRate | null> {
  const { data } = await supabase.from('exchange_rates').select('*').order('fecha', { ascending: false }).limit(1).maybeSingle();
  return data as ExchangeRate | null;
}

export async function listRates(): Promise<ExchangeRate[]> {
  const { data, error } = await supabase.from('exchange_rates').select('*').order('fecha', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExchangeRate[];
}

export async function upsertRate(data: {
  fecha?: string;
  bs_per_usd: number;
  eur_per_usd?: number | null;
  source?: 'manual' | 'bcv';
}): Promise<ExchangeRate> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const payload: Record<string, unknown> = {
    fecha: data.fecha ?? new Date().toISOString().slice(0, 10),
    bs_per_usd: data.bs_per_usd,
    source: data.source ?? 'manual',
    set_by: user.id,
  };
  if (data.eur_per_usd !== undefined) payload.eur_per_usd = data.eur_per_usd;
  const { data: row, error } = await supabase
    .from('exchange_rates').upsert(payload, { onConflict: 'fecha' }).select('*').single();
  if (error) throw error;
  return row as ExchangeRate;
}

/** Sincroniza la tasa oficial del BCV (edge function bcv-sync). */
export async function syncBcvRate(): Promise<ExchangeRate & { provider?: string }> {
  return invokeFunction<ExchangeRate & { provider?: string }>('bcv-sync', {}, { timeoutMs: 25000 });
}

export async function uploadReceipt(file: File): Promise<{ url: string; mime: string; size: number }> {
  const path = `payments/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return { url: path, mime: file.type, size: file.size };
}
