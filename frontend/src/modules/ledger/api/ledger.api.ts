import { api } from '../../../shared/api/client';

export type LedgerType = 'ingreso' | 'egreso';
export type LedgerStatus = 'registrado' | 'conciliado' | 'anulado';
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'paypal' | 'otro';

export interface LedgerCategory {
  id: number;
  nombre: string;
  slug: string;
  type: LedgerType;
  active: boolean;
  created_at: string;
}

export interface LedgerEntry {
  id: number;
  codigo: string;
  type: LedgerType;
  category: { id: number; nombre: string; slug: string };
  fecha: string;
  descripcion: string;
  monto: number;
  moneda: string;
  method: PaymentMethod | null;
  booking: { id: number; codigo: string } | null;
  customer: { id: number; nombre: string } | null;
  reverses_id: number | null;
  status: LedgerStatus;
  registered_by: number;
  receipts_count: number;
  created_at: string;
}

export interface LedgerSummary {
  totals: { ingresos: number; egresos: number; neto: number; moneda: string };
  byCategory: Array<{ categoryId: number; nombre: string; type: string; total: number }>;
  series: Array<{ period: string; ingresos: number; egresos: number }>;
}

// Categories
export const listCategories = (params?: { type?: LedgerType; active?: boolean }) =>
  api.get<LedgerCategory[]>('/api/ledger-categories', { query: params as Record<string, string | number | boolean | undefined> | undefined });
export const createCategory = (data: { nombre: string; slug: string; type: LedgerType }) =>
  api.post<LedgerCategory>('/api/ledger-categories', data);
export const updateCategory = (id: number, data: Partial<LedgerCategory>) =>
  api.patch<LedgerCategory>(`/api/ledger-categories/${id}`, data);
export const deleteCategory = (id: number) => api.delete(`/api/ledger-categories/${id}`);

// Ledger
export const listLedger = (params?: {
  type?: LedgerType; category_id?: number; dateFrom?: string; dateTo?: string;
  status?: LedgerStatus; booking_id?: number; customer_id?: number; search?: string;
  page?: number; limit?: number;
}) => api.getPaginated<LedgerEntry[]>('/api/ledger', { query: params as Record<string, string | number | boolean | undefined> | undefined });

export const getLedger = (id: number) => api.get<LedgerEntry>(`/api/ledger/${id}`);
export const ledgerSummary = (params: { dateFrom: string; dateTo: string; groupBy?: 'day' | 'week' | 'month' }) =>
  api.get<LedgerSummary>('/api/ledger/summary', { query: params as Record<string, string | number | boolean | undefined> });
export const createLedger = (data: {
  type: LedgerType; category_id: number; fecha: string; descripcion: string;
  monto: number; moneda?: string; method?: PaymentMethod | null;
  booking_id?: number | null; customer_id?: number | null;
}) => api.post<LedgerEntry>('/api/ledger', data);
export const conciliarLedger = (id: number) => api.post<LedgerEntry>(`/api/ledger/${id}/conciliar`);

// Receipts
export interface Receipt {
  id: number;
  ledger_entry_id: number;
  kind: 'imagen' | 'pdf';
  mime_type: string;
  size_bytes: number;
  original_name: string;
  uploaded_by?: number;
  created_at: string;
}
export const listReceipts = (ledgerEntryId: number) =>
  api.get<Receipt[]>(`/api/receipts/by-entry/${ledgerEntryId}`);
export const receiptUrl = (id: number) => api.get<{ url: string; expires_in: number }>(`/api/receipts/${id}/url`);
export const deleteReceipt = (id: number) => api.delete(`/api/receipts/${id}`);

export async function uploadReceipt(ledgerEntryId: number, file: File): Promise<Receipt> {
  const fd = new FormData();
  fd.append('ledger_entry_id', String(ledgerEntryId));
  fd.append('file', file);
  return api.post<Receipt>('/api/receipts', fd, { isFormData: true });
}
