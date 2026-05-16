// Cliente de la API /api/payments

import { api } from '../../../shared/api/client';

export type PaymentMethod =
  | 'efectivo'
  | 'tarjeta'
  | 'transferencia'
  | 'paypal'
  | 'otro'
  | 'pago_movil'
  | 'zelle'
  | 'punto_venta'
  | 'efectivo_usd'
  | 'efectivo_bs';

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
  registered_by: number;
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
  source: 'manual' | 'bcv';
}

export const listPayments = (params?: {
  status?: PaymentStatus;
  method?: PaymentMethod;
  booking_id?: number;
  customer_id?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}) => api.getPaginated<PaymentPublic[]>('/api/payments', { query: params as Record<string, string | number | boolean | undefined | null> | undefined });

export const getPayment = (id: number) => api.get<PaymentPublic>(`/api/payments/${id}`);

export const lookupQuick = (q: string) => api.get<QuickLookupItem[]>('/api/payments/lookup', { query: { q } });

export const createPayment = (data: CreatePaymentInput) => api.post<PaymentPublic>('/api/payments', data);

export const updatePayment = (id: number, data: { notas?: string | null; referencia?: string | null }) =>
  api.patch<PaymentPublic>(`/api/payments/${id}`, data);

export const confirmPayment = (id: number) => api.post<PaymentPublic>(`/api/payments/${id}/confirm`);

export const rejectPayment = (id: number, reason: string) => api.post<PaymentPublic>(`/api/payments/${id}/reject`, { reason });

export const getBookingStatement = (bookingId: number) => api.get<BookingStatement>(`/api/payments/booking/${bookingId}/statement`);

export const getCustomerStatement = (customerId: number) => api.get<CustomerStatement>(`/api/payments/customer/${customerId}/statement`);

export const getCurrentRate = () => api.get<ExchangeRate | null>('/api/payments/rates/current');

export const listRates = () => api.get<ExchangeRate[]>('/api/payments/rates');

export const upsertRate = (data: { fecha?: string; bs_per_usd: number; source?: 'manual' | 'bcv' }) =>
  api.post<ExchangeRate>('/api/payments/rates', data);

// Upload de captura/comprobante. Devuelve URL publica para guardar en receipt_url.
export async function uploadReceipt(file: File): Promise<{ url: string; mime: string; size: number }> {
  const fd = new FormData();
  fd.append('file', file);
  const { getAccessToken } = await import('../../../shared/api/client');
  const token = getAccessToken();
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3002';
  const res = await fetch(`${base}/api/payments/upload-receipt`, {
    method: 'POST',
    body: fd,
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json.data as { url: string; mime: string; size: number };
}
