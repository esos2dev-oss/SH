// Cliente HTTP para cierres de caja.

import { api } from '../../../shared/api/client';

export interface CashClosureTotals {
  by_method: Record<string, { count: number; total_moneda: Record<string, number> }>;
  total_confirmados: Record<string, number>;
  total_por_confirmar: Record<string, number>;
  total_count: number;
}

export interface CashClosure {
  id: number;
  codigo: string;
  user_id: number;
  user_name: string | null;
  opened_at: string;
  closed_at: string;
  totals: CashClosureTotals;
  pending_count: number;
  notas: string | null;
  signature_url: string | null;
  created_at: string;
}

export const previewClosure = (params: { opened_at: string; closed_at?: string; user_id?: number }) =>
  api.get<CashClosureTotals>('/api/payments/cash-closures/preview', { query: params });

export const closeShift = (data: { opened_at: string; closed_at?: string; user_id?: number; notas?: string | null; signature_url?: string | null }) =>
  api.post<CashClosure>('/api/payments/cash-closures', data);

export const listClosures = (params?: { user_id?: number; limit?: number }) =>
  api.get<CashClosure[]>('/api/payments/cash-closures', { query: params });

export const getClosure = (id: number) => api.get<CashClosure>(`/api/payments/cash-closures/${id}`);

export const lastClosureForUser = () => api.get<{ last_closed_at: string | null }>('/api/payments/cash-closures/last');
