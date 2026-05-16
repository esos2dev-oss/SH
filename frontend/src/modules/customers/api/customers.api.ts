import { api } from '../../../shared/api/client';

export type DocKind = 'dni' | 'pasaporte' | 'cedula' | 'licencia' | 'otro';

export interface Customer {
  id: number;
  nombres: string;
  apellidos: string;
  doc_kind: DocKind;
  doc_numero: string;
  email: string | null;
  telefono: string | null;
  fecha_nacimiento: string | null;
  nacionalidad: string | null;
  direccion: string | null;
  preferencias: Record<string, unknown>;
  notas: string | null;
  accepts_marketing: boolean;
  active: boolean;
  total_estancias: number;
  total_gastado: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerTimeline {
  bookings: Array<{ id: number; codigo: string; fecha_entrada: string; fecha_salida: string; status: string; importe_total: string; room_numero: string }>;
  emails: Array<{ id: number; asunto: string; event: string; status: string; sent_at: string | null; created_at: string }>;
}

export const listCustomers = (params?: { search?: string; doc_kind?: DocKind; segment?: 'vip' | 'inactivos' | 'birthdays_month' | 'recientes'; accepts_marketing?: boolean; page?: number; limit?: number }) =>
  api.getPaginated<Customer[]>('/api/customers', { query: params as Record<string, string | number | boolean | undefined> | undefined });

export const getCustomer = (id: number) => api.get<Customer>(`/api/customers/${id}`);
export const getCustomerTimeline = (id: number) => api.get<CustomerTimeline>(`/api/customers/${id}/timeline`);
export const createCustomer = (data: Partial<Customer> & { nombres: string; apellidos: string; doc_kind: DocKind; doc_numero: string }) =>
  api.post<Customer>('/api/customers', data);
export const updateCustomer = (id: number, data: Partial<Customer>) => api.patch<Customer>(`/api/customers/${id}`, data);
export const deleteCustomer = (id: number) => api.delete(`/api/customers/${id}`);
