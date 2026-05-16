// Types de respuesta del modulo dashboard.

export interface ArrivalToday {
  booking_id: number;
  codigo: string;
  customer_id: number;
  customer_nombre: string;
  customer_telefono: string | null;
  room_id: number;
  room_numero: string;
  fecha_entrada: string;
  importe_total: number;
  importe_pagado: number;
  importe_pendiente: number;
  moneda: string;
  payment_status: string;
  status: string;
}

export interface DepartureToday {
  booking_id: number;
  codigo: string;
  customer_id: number;
  customer_nombre: string;
  customer_telefono: string | null;
  room_id: number;
  room_numero: string;
  fecha_salida: string;
  importe_pendiente: number;
  moneda: string;
  status: string;
}

export interface CleaningPending {
  room_id: number;
  numero: string;
  planta: string | null;
  minutes_in_state: number;
}

export interface BirthdayToday {
  customer_id: number;
  nombre: string;
  edad: number;
  telefono: string | null;
  email: string | null;
  accepts_marketing: boolean;
}

export interface RoomBoardItem {
  room_id: number;
  numero: string;
  planta: string | null;
  type: string;
  status: string;
  current_booking: {
    id: number;
    codigo: string;
    customer_nombre: string;
    fecha_salida: string;
    importe_pendiente: number;
    moneda: string;
  } | null;
}

export interface PendingPaymentItem {
  payment_id: number;
  monto: number;
  moneda: string;
  method: string;
  referencia: string | null;
  pagado_at: string;
  booking_codigo: string | null;
  customer_nombre: string | null;
}

export interface BookingWithoutPaymentItem {
  booking_id: number;
  codigo: string;
  customer_nombre: string;
  room_numero: string;
  fecha_entrada: string;
  importe_total: number;
  moneda: string;
  hours_until_checkin: number;
}

export interface TodayKpis {
  arrivals_count: number;
  departures_count: number;
  occupancy_pct: number;
  rooms_total: number;
  rooms_occupied: number;
  pending_payments_count: number;
  cleanings_pending_count: number;
}

export interface DashboardPayload {
  kpis: TodayKpis;
  today: {
    arrivals: ArrivalToday[];
    departures: DepartureToday[];
    cleanings_pending: CleaningPending[];
    birthdays: BirthdayToday[];
  };
  rooms_board: RoomBoardItem[];
  inbox: {
    pending_payments: PendingPaymentItem[];
    bookings_without_payment: BookingWithoutPaymentItem[];
  };
  generated_at: string;
}
