// Types del dominio payments.
// Refleja la tabla booking_payments extendida en migracion 013.

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

export type PaymentConfirmationStatus = 'pending_confirmation' | 'confirmed' | 'rejected';

export interface PaymentRow {
  id: number;
  booking_id: number | null;
  customer_id: number | null;
  monto: string;
  moneda: string;
  monto_base: string | null;
  tasa_cambio: string | null;
  method: PaymentMethod;
  method_details: Record<string, unknown>;
  referencia: string | null;
  pagado_at: Date;
  status: PaymentConfirmationStatus;
  registered_by: number;
  confirmed_by: number | null;
  confirmed_at: Date | null;
  rejected_by: number | null;
  rejected_at: Date | null;
  rejected_reason: string | null;
  reversed_by_id: number | null;
  ledger_entry_id: number | null;
  bank_match_id: number | null;
  receipt_url: string | null;
  receipt_mime: string | null;
  notas: string | null;
  created_at: Date;
}

export interface PaymentWithJoins extends PaymentRow {
  booking_codigo: string | null;
  booking_status: string | null;
  customer_nombres: string | null;
  customer_apellidos: string | null;
  customer_telefono: string | null;
  customer_doc_numero: string | null;
}

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
  status: PaymentConfirmationStatus;
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

// Tipos auxiliares para statement de huesped/reserva
export interface ChargeLine {
  kind: 'charge';
  id: number | string;
  fecha: string;
  descripcion: string;
  monto: number;
  moneda: string;
}

export interface PaymentLine {
  kind: 'payment';
  id: number;
  fecha: string;
  descripcion: string;
  monto: number;
  moneda: string;
  method: PaymentMethod;
  status: PaymentConfirmationStatus;
  referencia: string | null;
}

export type StatementLine = ChargeLine | PaymentLine;

export interface StatementSummary {
  moneda: string;
  total_cargos: number;
  total_pagado_confirmado: number;
  total_pagado_pendiente: number;
  saldo: number;
  saldo_efectivo: number;
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

export interface BookingStatement {
  booking: { id: number; codigo: string; status: string; fecha_entrada: string; fecha_salida: string; importe_total: number; moneda: string };
  customer: { id: number; nombre: string; telefono: string | null };
  lines: StatementLine[];
  summary: StatementSummary;
}
