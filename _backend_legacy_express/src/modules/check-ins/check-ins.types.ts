export interface CheckInRow {
  id: number;
  booking_id: number;
  hora_entrada: Date;
  hora_salida: Date | null;
  firma_url: string | null;
  documento_url: string | null;
  huespedes_acompaniantes: Array<Record<string, unknown>>;
  observaciones: string | null;
  registered_by: number;
  checked_out_by: number | null;
  created_at: Date;
  updated_at: Date;
}
