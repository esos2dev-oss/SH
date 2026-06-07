// Cierres de caja — version basica.
// La preview con agregaciones complejas queda como stub minimo hasta promoverla
// a RPC.

import { supabase } from '../../../shared/lib/supabase';

export interface CashClosureTotals {
  by_method: Record<string, { count: number; total_moneda: Record<string, number> }>;
  total_confirmados: Record<string, number>;
  total_por_confirmar: Record<string, number>;
  total_count: number;
}

export interface CashClosure {
  id: number; codigo: string; user_id: string; user_name: string | null;
  opened_at: string; closed_at: string;
  totals: CashClosureTotals; pending_count: number;
  notas: string | null; signature_url: string | null; created_at: string;
}

async function aggregate(params: { opened_at: string; closed_at?: string; user_id?: string }): Promise<CashClosureTotals> {
  let q = supabase.from('booking_payments').select('method, status, monto, moneda').gte('pagado_at', params.opened_at);
  if (params.closed_at) q = q.lte('pagado_at', params.closed_at);
  if (params.user_id) q = q.eq('registered_by', params.user_id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Row = { method: string; status: string; monto: number; moneda: string };
  const totals: CashClosureTotals = { by_method: {}, total_confirmados: {}, total_por_confirmar: {}, total_count: 0 };
  for (const r of (data ?? []) as Row[]) {
    totals.total_count++;
    const m = totals.by_method[r.method] ?? { count: 0, total_moneda: {} };
    m.count++;
    m.total_moneda[r.moneda] = (m.total_moneda[r.moneda] ?? 0) + Number(r.monto);
    totals.by_method[r.method] = m;
    const bucket = r.status === 'confirmed' ? totals.total_confirmados : totals.total_por_confirmar;
    bucket[r.moneda] = (bucket[r.moneda] ?? 0) + Number(r.monto);
  }
  return totals;
}

export async function previewClosure(params: { opened_at: string; closed_at?: string; user_id?: string }): Promise<CashClosureTotals> {
  return aggregate(params);
}

export async function closeShift(data: { opened_at: string; closed_at?: string; user_id?: string; notas?: string | null; signature_url?: string | null }): Promise<CashClosure> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const totals = await aggregate({ opened_at: data.opened_at, closed_at: data.closed_at, user_id: data.user_id ?? user.id });
  const { data: codigo, error: cErr } = await supabase.rpc('next_code', { p_prefix: 'CC' });
  if (cErr) throw new Error(cErr.message);
  const { data: row, error } = await supabase.from('cash_closures').insert({
    codigo,
    user_id: data.user_id ?? user.id,
    opened_at: data.opened_at,
    closed_at: data.closed_at ?? new Date().toISOString(),
    totals,
    pending_count: Object.values(totals.total_por_confirmar).length > 0 ? Object.values(totals.total_por_confirmar).reduce((a, b) => a + b, 0) : 0,
    notas: data.notas ?? null,
    signature_url: data.signature_url ?? null,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return { ...(row as CashClosure), user_name: null };
}

export async function listClosures(params?: { user_id?: string; limit?: number }): Promise<CashClosure[]> {
  let q = supabase.from('cash_closures').select('*').order('closed_at', { ascending: false }).limit(params?.limit ?? 50);
  if (params?.user_id) q = q.eq('user_id', params.user_id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...(r as CashClosure), user_name: null }));
}

export async function getClosure(id: number): Promise<CashClosure> {
  const { data, error } = await supabase.from('cash_closures').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return { ...(data as CashClosure), user_name: null };
}

export async function lastClosureForUser(): Promise<{ last_closed_at: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { last_closed_at: null };
  const { data } = await supabase.from('cash_closures').select('closed_at').eq('user_id', user.id).order('closed_at', { ascending: false }).limit(1).maybeSingle();
  return { last_closed_at: (data as { closed_at: string } | null)?.closed_at ?? null };
}
