import { api } from '../../../shared/api/client';

export type BookingPeriod = 'dia' | 'semana' | 'mes';
export type BookingStatus = 'pendiente' | 'confirmada' | 'en_curso' | 'finalizada' | 'cancelada' | 'no_show';
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'paypal' | 'otro';

export interface Booking {
  id: number;
  codigo: string;
  period: BookingPeriod;
  fecha_entrada: string;
  fecha_salida: string;
  huespedes: number;
  tarifa_aplicada: number;
  descuento_pct: number;
  descuento_monto: number;
  importe_total: number;
  importe_pagado: number;
  importe_pendiente: number;
  moneda: string;
  payment_status: 'pendiente' | 'parcial' | 'pagado' | 'reembolsado';
  status: BookingStatus;
  origen: string;
  notas: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  customer: { id: number; nombre: string; email: string | null };
  room: { id: number; numero: string; planta: string | null; type: string };
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface BookingPayment {
  id: number;
  booking_id: number;
  monto: string;
  moneda: string;
  method: PaymentMethod;
  referencia: string | null;
  pagado_at: string;
  registered_by: number;
  ledger_entry_id: number | null;
  notas: string | null;
  created_at: string;
}

export interface AvailabilityRoom {
  id: number; numero: string; planta: string | null; room_type: string; tarifa_dia: number;
}

export const listBookings = (params?: {
  status?: BookingStatus; customer_id?: number; room_id?: number; period?: BookingPeriod;
  dateFrom?: string; dateTo?: string; search?: string; page?: number; limit?: number;
}) => api.getPaginated<Booking[]>('/api/bookings', { query: params as Record<string, string | number | boolean | undefined> | undefined });

export const getBooking = (id: number) => api.get<Booking>(`/api/bookings/${id}`);
export const calendarBookings = (dateFrom: string, dateTo: string) =>
  api.get<Booking[]>('/api/bookings/calendar', { query: { dateFrom, dateTo } });
export const availability = (params: { dateFrom: string; dateTo: string; room_type_id?: number; huespedes?: number }) =>
  api.get<AvailabilityRoom[]>('/api/bookings/availability', { query: params as Record<string, string | number | boolean | undefined> });

export const createBooking = (data: {
  customer_id: number; room_id: number; period: BookingPeriod;
  fecha_entrada: string; fecha_salida: string; huespedes?: number;
  promotion_code?: string | null; descuento_pct?: number; descuento_monto?: number; notas?: string | null;
}) => api.post<Booking>('/api/bookings', data);
export const updateBooking = (id: number, data: { huespedes?: number; notas?: string | null }) =>
  api.patch<Booking>(`/api/bookings/${id}`, data);
export const confirmBooking = (id: number) => api.post<Booking>(`/api/bookings/${id}/confirm`);
export const cancelBooking = (id: number, reason: string) => api.post<Booking>(`/api/bookings/${id}/cancel`, { reason });
export const noShowBooking = (id: number) => api.post<Booking>(`/api/bookings/${id}/no-show`);

// Payments
export const listPayments = (bookingId: number) => api.get<BookingPayment[]>(`/api/bookings/${bookingId}/payments`);
export const addPayment = (bookingId: number, data: {
  monto: number; method: PaymentMethod; referencia?: string | null; pagado_at?: string; notas?: string | null;
}) => api.post<{ payment: BookingPayment; booking: Booking }>(`/api/bookings/${bookingId}/payments`, data);
