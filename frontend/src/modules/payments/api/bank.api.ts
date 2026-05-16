// Cliente HTTP para conciliacion bancaria.

import { api, getAccessToken } from '../../../shared/api/client';

export type BankKey = 'banesco' | 'mercantil' | 'venezuela' | 'provincial' | 'generic';

export interface BankStatement {
  id: number;
  banco: string;
  cuenta: string | null;
  fecha_desde: string;
  fecha_hasta: string;
  moneda: string;
  original_name: string;
  total_movs: number;
  matched_movs: number;
  uploaded_by: number;
  created_at: string;
}

export interface BankMovement {
  id: number;
  statement_id: number;
  fecha: string;
  referencia: string | null;
  descripcion: string | null;
  monto: number;
  tipo: 'C' | 'D';
  moneda: string;
  matched_payment_id: number | null;
  raw_line: string | null;
}

export interface UploadResult {
  statement: BankStatement;
  matched: number;
  total: number;
  warnings: string[];
}

export interface MatchSuggestion {
  payment_id: number;
  score: number;
  reason: string;
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3002';

export async function uploadStatement(banco: BankKey, file: File, opts: { cuenta?: string; moneda?: string } = {}): Promise<UploadResult> {
  const fd = new FormData();
  fd.append('banco', banco);
  fd.append('moneda', opts.moneda ?? 'VES');
  if (opts.cuenta) fd.append('cuenta', opts.cuenta);
  fd.append('file', file);
  // Llamada multipart directa via fetch (api.post no soporta FormData con body raw).
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}/api/payments/bank-statements/upload`, {
    method: 'POST',
    body: fd,
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json.data as UploadResult;
}

export const listStatements = () => api.get<BankStatement[]>('/api/payments/bank-statements');

export const listMovements = (statementId: number, onlyUnmatched = false) =>
  api.get<BankMovement[]>(`/api/payments/bank-statements/${statementId}/movements`, { query: onlyUnmatched ? { unmatched: 'true' } : {} });

export const autoConfirm = (statementId: number) =>
  api.post<{ confirmed: number }>(`/api/payments/bank-statements/${statementId}/auto-confirm`);

export const getSuggestions = (movementId: number) =>
  api.get<MatchSuggestion[]>(`/api/payments/bank-movements/${movementId}/suggestions`);

export const matchMovement = (movementId: number, paymentId: number | null) =>
  api.post<{ ok: true }>(`/api/payments/bank-movements/${movementId}/match`, { payment_id: paymentId });
