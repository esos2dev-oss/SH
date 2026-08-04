// Cierres de caja — version basica.
// La preview con agregaciones complejas queda como stub minimo hasta promoverla
// a RPC.

import { supabase } from '../../../shared/lib/supabase';

export interface CashClosureTotals {
  moneda_base: string;
  by_method: Record<string, {
    count: number;
    total_base_usd: number;
    total_moneda: Record<string, number>;
  }>;
  total_confirmado_base_usd: number;
  total_por_confirmar_base_usd: number;
  /** Numero de pagos por confirmar (antes guardaba una suma de importes). */
  pending_count: number;
  total_count: number;
  /** Cobros de reservas que se cancelaron: no cuadran caja, requieren devolucion. */
  cancelados: { count: number; total_base_usd: number };
}

export interface CashClosure {
  id: number; codigo: string; user_id: string; user_name: string | null;
  opened_at: string; closed_at: string;
  totals: CashClosureTotals; pending_count: number;
  notas: string | null; signature_url: string | null; created_at: string;
}

// La agregacion vive ahora en la RPC cash_closure_preview. Motivos:
//  - suma en moneda base ademas de por moneda (antes mezclaba EUR/USD/VES),
//  - excluye los cobros de reservas canceladas (bug 19),
//  - pending_count es un CONTEO y no una suma de importes (estaba mal).
async function aggregate(params: { opened_at: string; closed_at?: string; user_id?: string }): Promise<CashClosureTotals> {
  const { data, error } = await supabase.rpc('cash_closure_preview', {
    p_opened_at: params.opened_at,
    p_closed_at: params.closed_at ?? null,
    p_user_id: params.user_id ?? null,
  });
  if (error) throw error;
  return data as CashClosureTotals;
}

export async function previewClosure(params: { opened_at: string; closed_at?: string; user_id?: string }): Promise<CashClosureTotals> {
  return aggregate(params);
}

export async function closeShift(data: { opened_at: string; closed_at?: string; user_id?: string; notas?: string | null; signature_url?: string | null }): Promise<CashClosure> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const totals = await aggregate({ opened_at: data.opened_at, closed_at: data.closed_at, user_id: data.user_id ?? user.id });
  const { data: codigo, error: cErr } = await supabase.rpc('next_code', { p_prefix: 'CC' });
  if (cErr) throw cErr;
  const { data: row, error } = await supabase.from('cash_closures').insert({
    codigo,
    user_id: data.user_id ?? user.id,
    opened_at: data.opened_at,
    closed_at: data.closed_at ?? new Date().toISOString(),
    totals,
    pending_count: totals.pending_count ?? 0,
    notas: data.notas ?? null,
    signature_url: data.signature_url ?? null,
  }).select('*').single();
  if (error) throw error;
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
