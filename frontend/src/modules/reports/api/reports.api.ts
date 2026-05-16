import { api } from '../../../shared/api/client';

export interface FinancialReport {
  period: string;
  rangeFrom: string;
  rangeTo: string;
  totals: { ingresos: number; egresos: number; neto: number; moneda: string };
  byCategory: Array<{ categoryId: number; nombre: string; type: string; total: number }>;
  series: Array<{ period: string; ingresos: number; egresos: number }>;
  bookingsCount: number;
  occupancyAvg: number;
}

export interface OccupancyReport {
  rangeFrom: string;
  rangeTo: string;
  totalRooms: number;
  series: Array<{ day: string; ocupadas: number; rate: number }>;
}

export interface CustomersReport {
  top: Array<{ id: number; nombre: string; estancias: number; gastado: number }>;
  segments: { vip: number; inactivos: number; recientes: number; cumple_mes: number };
}

export const financialReport = (params: { period?: 'daily' | 'weekly' | 'monthly'; dateFrom: string; dateTo: string }) =>
  api.get<FinancialReport>('/api/reports/financial', { query: params as Record<string, string | number | boolean | undefined> });

export const occupancyReport = (params: { dateFrom: string; dateTo: string }) =>
  api.get<OccupancyReport>('/api/reports/occupancy', { query: params });

export const customersReport = () => api.get<CustomersReport>('/api/reports/customers');

export function financialCsvUrl(params: { period?: 'daily' | 'weekly' | 'monthly'; dateFrom: string; dateTo: string }): string {
  const base: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';
  const url = new URL(`${base}/api/reports/financial.csv`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}
