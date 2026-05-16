import { api } from '../../../shared/api/client';

export interface Promotion {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  kind: 'porcentaje' | 'monto_fijo';
  valor: number;
  moneda: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  max_usos: number | null;
  usos_actuales: number;
  condiciones: Record<string, unknown>;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ValidateResult {
  valid: boolean;
  reason?: string;
  promotion?: Promotion;
}

export const listPromotions = (params?: { active?: boolean; codigo?: string; kind?: 'porcentaje' | 'monto_fijo' }) =>
  api.get<Promotion[]>('/api/promotions', { query: params as Record<string, string | number | boolean | undefined> | undefined });
export const getPromotion = (id: number) => api.get<Promotion>(`/api/promotions/${id}`);
export const createPromotion = (data: Partial<Promotion> & { codigo: string; nombre: string; kind: 'porcentaje' | 'monto_fijo'; valor: number; fecha_inicio: string; fecha_fin: string }) =>
  api.post<Promotion>('/api/promotions', data);
export const updatePromotion = (id: number, data: Partial<Promotion>) => api.patch<Promotion>(`/api/promotions/${id}`, data);
export const deletePromotion = (id: number) => api.delete(`/api/promotions/${id}`);
export const validatePromotion = (data: { codigo: string; room_id?: number; fecha_entrada: string; fecha_salida: string }) =>
  api.post<ValidateResult>('/api/promotions/validate', data);
