export type LedgerType = 'ingreso' | 'egreso';
export type LedgerStatus = 'registrado' | 'conciliado' | 'anulado';

export interface LedgerEntryRow {
  id: number;
  codigo: string;
  type: LedgerType;
  category_id: number;
  fecha: Date;
  descripcion: string;
  monto: string;
  moneda: string;
  method: string | null;
  booking_id: number | null;
  customer_id: number | null;
  reverses_id: number | null;
  status: LedgerStatus;
  registered_by: number;
  created_at: Date;
}

export interface LedgerEntryWithJoins extends LedgerEntryRow {
  category_nombre: string;
  category_slug: string;
  customer_nombre: string | null;
  booking_codigo: string | null;
  receipts_count: string;
}
