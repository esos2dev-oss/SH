import { supabase, invokeFunction } from '../../../shared/lib/supabase';
import { cached, invalidate } from '../../../shared/lib/cached';
import type { PaginatedResponse } from '../../../shared/api/client';

export type LedgerType = 'ingreso' | 'egreso';
export type LedgerStatus = 'registrado' | 'conciliado' | 'anulado';
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'paypal' | 'otro';

export interface LedgerCategory {
  id: number; nombre: string; slug: string; type: LedgerType; active: boolean; created_at: string;
}

export interface LedgerEntry {
  id: number; codigo: string; type: LedgerType;
  category: { id: number; nombre: string; slug: string };
  fecha: string; descripcion: string; monto: number; moneda: string;
  method: PaymentMethod | null;
  booking: { id: number; codigo: string } | null;
  customer: { id: number; nombre: string } | null;
  reverses_id: number | null;
  status: LedgerStatus;
  registered_by: string;
  receipts_count: number;
  created_at: string;
}

export interface LedgerSummary {
  totals: { ingresos: number; egresos: number; neto: number; moneda: string };
  byCategory: Array<{ categoryId: number; nombre: string; type: string; total: number }>;
  series: Array<{ period: string; ingresos: number; egresos: number }>;
}

export async function listCategories(params?: { type?: LedgerType; active?: boolean }): Promise<LedgerCategory[]> {
  if (params?.active === true && !params.type) {
    return cached('ledger_categories:active', 5 * 60_000, async () => {
      const { data, error } = await supabase.from('ledger_categories').select('*').eq('active', true).order('nombre');
      if (error) throw new Error(error.message);
      return (data ?? []) as LedgerCategory[];
    });
  }
  let q = supabase.from('ledger_categories').select('*').order('nombre');
  if (params?.type) q = q.eq('type', params.type);
  if (params?.active !== undefined) q = q.eq('active', params.active);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as LedgerCategory[];
}

export async function createCategory(data: { nombre: string; slug: string; type: LedgerType }): Promise<LedgerCategory> {
  const { data: row, error } = await supabase.from('ledger_categories').insert(data).select('*').single();
  if (error) throw new Error(error.message);
  invalidate('ledger_categories:active');
  return row as LedgerCategory;
}

export async function updateCategory(id: number, data: Partial<LedgerCategory>): Promise<LedgerCategory> {
  const allowed = ['nombre','slug','type','active'] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if ((data as Record<string, unknown>)[k] !== undefined) patch[k] = (data as Record<string, unknown>)[k];
  const { data: row, error } = await supabase.from('ledger_categories').update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return row as LedgerCategory;
}

export async function deleteCategory(id: number): Promise<void> {
  const { error } = await supabase.from('ledger_categories').delete().eq('id', id);
  if (error) throw new Error(error.message);
  invalidate('ledger_categories:active');
}

export async function listLedger(params?: {
  type?: LedgerType; category_id?: number; dateFrom?: string; dateTo?: string;
  status?: LedgerStatus; booking_id?: number; customer_id?: number; search?: string;
  page?: number; limit?: number;
}): Promise<PaginatedResponse<LedgerEntry[]>> {
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  let q = supabase.from('ledger_entries_with_relations').select('*', { count: 'exact' }).order('fecha', { ascending: false }).range(from, to);
  if (params?.type) q = q.eq('type', params.type);
  if (params?.status) q = q.eq('status', params.status);
  if (params?.dateFrom) q = q.gte('fecha', params.dateFrom);
  if (params?.dateTo) q = q.lte('fecha', params.dateTo);
  if (params?.search) q = q.ilike('descripcion', `%${params.search}%`);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return {
    data: (data ?? []) as LedgerEntry[],
    pagination: { total: count ?? 0, page, limit, totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)) },
  };
}

export async function getLedger(id: number): Promise<LedgerEntry> {
  const { data, error } = await supabase.from('ledger_entries_with_relations').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as LedgerEntry;
}

export async function ledgerSummary(params: { dateFrom: string; dateTo: string; groupBy?: 'day' | 'week' | 'month' }): Promise<LedgerSummary> {
  const { data, error } = await supabase.rpc('ledger_summary', {
    p_from: params.dateFrom, p_to: params.dateTo, p_group: params.groupBy ?? 'day',
  });
  if (error) throw new Error(error.message);
  return data as LedgerSummary;
}

export async function createLedger(data: {
  type: LedgerType; category_id: number; fecha: string; descripcion: string;
  monto: number; moneda?: string; method?: PaymentMethod | null;
  booking_id?: number | null; customer_id?: number | null;
}): Promise<LedgerEntry> {
  const { data: codigo, error: cErr } = await supabase.rpc('next_code', { p_prefix: 'LG' });
  if (cErr) throw new Error(cErr.message);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { data: row, error } = await supabase.from('ledger_entries').insert({
    codigo,
    type: data.type,
    category_id: data.category_id,
    fecha: data.fecha,
    descripcion: data.descripcion,
    monto: data.monto,
    moneda: data.moneda ?? 'EUR',
    method: data.method ?? null,
    booking_id: data.booking_id ?? null,
    customer_id: data.customer_id ?? null,
    registered_by: user.id,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return getLedger((row as { id: number }).id);
}

export async function conciliarLedger(id: number): Promise<LedgerEntry> {
  await invokeFunction('ledger-reverse', { entry_id: id } as Record<string, unknown>);
  return getLedger(id);
}

export interface Receipt {
  id: number; ledger_entry_id: number; kind: 'imagen' | 'pdf'; mime_type: string;
  size_bytes: number; original_name: string; uploaded_by?: string; created_at: string;
}

export async function listReceipts(ledgerEntryId: number): Promise<Receipt[]> {
  const { data, error } = await supabase.from('receipts').select('*').eq('ledger_entry_id', ledgerEntryId).eq('active', true);
  if (error) throw new Error(error.message);
  return (data ?? []) as Receipt[];
}

export async function receiptUrl(id: number): Promise<{ url: string; expires_in: number }> {
  const { data: r, error: e1 } = await supabase.from('receipts').select('storage_path').eq('id', id).single();
  if (e1) throw new Error(e1.message);
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl((r as { storage_path: string }).storage_path, 60 * 15);
  if (error) throw new Error(error.message);
  return { url: data.signedUrl, expires_in: 60 * 15 };
}

export async function deleteReceipt(id: number): Promise<void> {
  const { error } = await supabase.from('receipts').update({ active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function uploadReceipt(ledgerEntryId: number, file: File): Promise<Receipt> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const path = `entries/${ledgerEntryId}/${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(upErr.message);
  const kind: 'imagen' | 'pdf' = file.type === 'application/pdf' ? 'pdf' : 'imagen';
  const { data, error } = await supabase.from('receipts').insert({
    ledger_entry_id: ledgerEntryId,
    storage_path: path,
    kind,
    mime_type: file.type,
    size_bytes: file.size,
    original_name: file.name,
    uploaded_by: user.id,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return data as Receipt;
}
