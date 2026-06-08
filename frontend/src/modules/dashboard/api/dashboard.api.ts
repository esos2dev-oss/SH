import { supabase } from '../../../shared/lib/supabase';

export interface ArrivalToday {
  booking_id: number; codigo: string;
  customer_id: number; customer_nombre: string; customer_telefono: string | null;
  room_id: number; room_numero: string;
  fecha_entrada: string;
  importe_total: number; importe_pagado: number; importe_pendiente: number;
  moneda: string; payment_status: string; status: string;
}
export interface DepartureToday {
  booking_id: number; codigo: string;
  customer_id: number; customer_nombre: string; customer_telefono: string | null;
  room_id: number; room_numero: string;
  fecha_salida: string; importe_pendiente: number; moneda: string; status: string;
}
export interface CleaningPending { room_id: number; numero: string; planta: string | null; minutes_in_state: number; }
export interface BirthdayToday { customer_id: number; nombre: string; edad: number; telefono: string | null; email: string | null; accepts_marketing: boolean; }
export interface RoomBoardItem {
  room_id: number; numero: string; planta: string | null; type: string; status: string;
  current_booking: { id: number; codigo: string; customer_nombre: string; fecha_salida: string; importe_pendiente: number; moneda: string } | null;
}
export interface PendingPaymentItem { payment_id: number; monto: number; moneda: string; method: string; referencia: string | null; pagado_at: string; booking_codigo: string | null; customer_nombre: string | null; }
export interface BookingWithoutPaymentItem { booking_id: number; codigo: string; customer_nombre: string; room_numero: string; fecha_entrada: string; importe_total: number; moneda: string; hours_until_checkin: number; }
export interface TodayKpis { arrivals_count: number; departures_count: number; occupancy_pct: number; rooms_total: number; rooms_occupied: number; pending_payments_count: number; cleanings_pending_count: number; }
export interface DashboardPayload {
  kpis: TodayKpis;
  today: { arrivals: ArrivalToday[]; departures: DepartureToday[]; cleanings_pending: CleaningPending[]; birthdays: BirthdayToday[] };
  rooms_board: RoomBoardItem[];
  inbox: { pending_payments: PendingPaymentItem[]; bookings_without_payment: BookingWithoutPaymentItem[] };
  generated_at: string;
}

export async function getDashboardToday(date?: string): Promise<DashboardPayload> {
  const { data, error } = await supabase.rpc('dashboard_today', date ? { p_date: date } : {});
  if (error) throw new Error(error.message);
  return data as DashboardPayload;
}

export interface OccupancyExtras {
  month: { rangeFrom: string; rangeTo: string; occupancyPct: number; revenue: number };
  year:  { rangeFrom: string; rangeTo: string; occupancyPct: number; revenue: number };
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

// Ocupacion del mes en curso y del anio en curso, calculado con reports_kpis.
export async function getOccupancyExtras(): Promise<OccupancyExtras> {
  const now = new Date();
  const monthFrom = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthTo   = isoDate(now);
  const yearFrom  = isoDate(new Date(now.getFullYear(), 0, 1));
  const yearTo    = isoDate(now);

  const [m, y] = await Promise.all([
    supabase.rpc('reports_kpis', { p_from: monthFrom, p_to: monthTo }),
    supabase.rpc('reports_kpis', { p_from: yearFrom,  p_to: yearTo  }),
  ]);
  if (m.error) throw new Error(m.error.message);
  if (y.error) throw new Error(y.error.message);
  const mr = m.data as { occupancyPct: number; revenue: number };
  const yr = y.data as { occupancyPct: number; revenue: number };
  return {
    month: { rangeFrom: monthFrom, rangeTo: monthTo, occupancyPct: Number(mr.occupancyPct ?? 0), revenue: Number(mr.revenue ?? 0) },
    year:  { rangeFrom: yearFrom,  rangeTo: yearTo,  occupancyPct: Number(yr.occupancyPct ?? 0), revenue: Number(yr.revenue ?? 0) },
  };
}
