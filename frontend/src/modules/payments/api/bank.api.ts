// Conciliacion bancaria — version basica contra Supabase.
// La conciliacion automatica (parser de PDF/CSV + matching) queda pendiente
// como edge function. Por ahora la UI puede listar statements/movements y
// hacer matching manual.

import { supabase } from '../../../shared/lib/supabase';

export type BankKey = 'banesco' | 'mercantil' | 'venezuela' | 'provincial' | 'generic';

export interface BankStatement {
  id: number; banco: string; cuenta: string | null;
  fecha_desde: string; fecha_hasta: string; moneda: string;
  original_name: string; total_movs: number; matched_movs: number;
  uploaded_by: string; created_at: string;
}

export interface BankMovement {
  id: number; statement_id: number; fecha: string;
  referencia: string | null; descripcion: string | null;
  monto: number; tipo: 'C' | 'D'; moneda: string;
  matched_payment_id: number | null; raw_line: string | null;
}

export interface UploadResult { statement: BankStatement; matched: number; total: number; warnings: string[]; }
export interface MatchSuggestion { payment_id: number; score: number; reason: string; }

export async function uploadStatement(_banco: BankKey, _file: File, _opts: { cuenta?: string; moneda?: string } = {}): Promise<UploadResult> {
  throw new Error('La importacion de extractos bancarios aun no esta disponible en Supabase puro. Pendiente como edge function.');
}

export async function listStatements(): Promise<BankStatement[]> {
  const { data, error } = await supabase.from('bank_statements').select('*').order('fecha_desde', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as BankStatement[];
}

export async function listMovements(statementId: number, onlyUnmatched = false): Promise<BankMovement[]> {
  let q = supabase.from('bank_statement_movements').select('*').eq('statement_id', statementId).order('fecha');
  if (onlyUnmatched) q = q.is('matched_payment_id', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as BankMovement[];
}

export async function autoConfirm(_statementId: number): Promise<{ confirmed: number }> {
  return { confirmed: 0 };
}

export async function getSuggestions(_movementId: number): Promise<MatchSuggestion[]> {
  return [];
}

export async function matchMovement(movementId: number, paymentId: number | null): Promise<{ ok: true }> {
  const { error } = await supabase.from('bank_statement_movements').update({ matched_payment_id: paymentId }).eq('id', movementId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
