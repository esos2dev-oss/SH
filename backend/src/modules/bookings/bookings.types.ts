export type BookingPeriod = 'dia' | 'semana' | 'mes';
export type BookingStatus = 'pendiente' | 'confirmada' | 'en_curso' | 'finalizada' | 'cancelada' | 'no_show';
export type PaymentStatus = 'pendiente' | 'parcial' | 'pagado' | 'reembolsado';
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

export interface BookingRow {
  id: number;
  codigo: string;
  customer_id: number;
  room_id: number;
  period: BookingPeriod;
  fecha_entrada: Date;
  fecha_salida: Date;
  huespedes: number;
  tarifa_aplicada: string;
  descuento_pct: string;
  descuento_monto: string;
  importe_total: string;
  importe_pagado: string;
  moneda: string;
  payment_status: PaymentStatus;
  status: BookingStatus;
  origen: string;
  notas: string | null;
  cancelled_at: Date | null;
  cancelled_reason: string | null;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}

export interface BookingWithJoins extends BookingRow {
  customer_nombres: string;
  customer_apellidos: string;
  customer_email: string | null;
  room_numero: string;
  room_planta: string | null;
  room_type_nombre: string;
}

export interface BookingPaymentRow {
  id: number;
  booking_id: number;
  monto: string;
  moneda: string;
  method: PaymentMethod;
  referencia: string | null;
  pagado_at: Date;
  registered_by: number;
  ledger_entry_id: number | null;
  notas: string | null;
  created_at: Date;
}
