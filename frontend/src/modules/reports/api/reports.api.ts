import { supabase } from '../../../shared/lib/supabase';

export interface FinancialReport {
  period: string; rangeFrom: string; rangeTo: string;
  totals: { ingresos: number; egresos: number; neto: number; moneda: string };
  byCategory: Array<{ categoryId: number; nombre: string; type: string; total: number }>;
  series: Array<{ period: string; ingresos: number; egresos: number }>;
  bookingsCount: number; occupancyAvg: number;
}

export interface OccupancyReport {
  rangeFrom: string; rangeTo: string; totalRooms: number;
  series: Array<{ day: string; ocupadas: number; rate: number }>;
}

export interface CustomersReport {
  top: Array<{ id: number; nombre: string; estancias: number; gastado: number }>;
  segments: { vip: number; inactivos: number; recientes: number; cumple_mes: number };
}

export interface KpisReport {
  rangeFrom: string; rangeTo: string;
  totalRooms: number; days: number;
  roomNights: number; availableRoomNights: number;
  revenue: number; occupancyPct: number; adr: number; revpar: number;
  topRoomTypes: Array<{ id: number; nombre: string; bookings: number; revenue: number }>;
}

export interface PaymentMethodsReport {
  rangeFrom: string; rangeTo: string;
  by_method: Array<{
    method: string; count: number;
    confirmed: Record<string, number>;
    pending: Record<string, number>;
  }>;
}

export async function financialReport(params: { period?: 'daily' | 'weekly' | 'monthly'; dateFrom: string; dateTo: string }): Promise<FinancialReport> {
  const groupBy = params.period === 'monthly' ? 'month' : params.period === 'weekly' ? 'week' : 'day';
  const { data, error } = await supabase.rpc('ledger_summary', {
    p_from: params.dateFrom, p_to: params.dateTo, p_group: groupBy,
  });
  if (error) throw new Error(error.message);
  const s = data as { totals: FinancialReport['totals']; byCategory: FinancialReport['byCategory']; series: FinancialReport['series'] };
  return {
    period: params.period ?? 'daily',
    rangeFrom: params.dateFrom, rangeTo: params.dateTo,
    totals: s.totals, byCategory: s.byCategory, series: s.series,
    bookingsCount: 0, occupancyAvg: 0,
  };
}

export async function occupancyReport(params: { dateFrom: string; dateTo: string }): Promise<OccupancyReport> {
  const { count } = await supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('active', true);
  return { rangeFrom: params.dateFrom, rangeTo: params.dateTo, totalRooms: count ?? 0, series: [] };
}

export async function customersReport(): Promise<CustomersReport> {
  const { data: top, error } = await supabase
    .from('customers_with_stats')
    .select('id, nombres, apellidos, total_estancias, total_gastado')
    .order('total_gastado', { ascending: false, nullsFirst: false })
    .limit(10);
  if (error) throw new Error(error.message);
  type Row = { id: number; nombres: string; apellidos: string; total_estancias: number; total_gastado: number };
  return {
    top: (top as Row[] ?? []).map((c) => ({ id: c.id, nombre: `${c.nombres} ${c.apellidos}`, estancias: c.total_estancias, gastado: Number(c.total_gastado) })),
    segments: { vip: 0, inactivos: 0, recientes: 0, cumple_mes: 0 },
  };
}

export async function kpisReport(params: { dateFrom: string; dateTo: string }): Promise<KpisReport> {
  const { data, error } = await supabase.rpc('reports_kpis', { p_from: params.dateFrom, p_to: params.dateTo });
  if (error) throw new Error(error.message);
  return data as KpisReport;
}

export async function paymentMethodsReport(params: { dateFrom: string; dateTo: string }): Promise<PaymentMethodsReport> {
  const { data, error } = await supabase
    .from('booking_payments')
    .select('method, status, monto, moneda')
    .gte('pagado_at', params.dateFrom)
    .lte('pagado_at', params.dateTo);
  if (error) throw new Error(error.message);

  type Row = { method: string; status: string; monto: number; moneda: string };
  const byMethod = new Map<string, { count: number; confirmed: Record<string, number>; pending: Record<string, number> }>();
  for (const r of (data ?? []) as Row[]) {
    const m = byMethod.get(r.method) ?? { count: 0, confirmed: {}, pending: {} };
    m.count++;
    const bucket = r.status === 'confirmed' ? m.confirmed : m.pending;
    bucket[r.moneda] = (bucket[r.moneda] ?? 0) + Number(r.monto);
    byMethod.set(r.method, m);
  }
  return {
    rangeFrom: params.dateFrom, rangeTo: params.dateTo,
    by_method: Array.from(byMethod, ([method, v]) => ({ method, ...v })),
  };
}

export function financialCsvUrl(_params: { period?: 'daily' | 'weekly' | 'monthly'; dateFrom: string; dateTo: string }): string {
  return 'about:blank';
}
