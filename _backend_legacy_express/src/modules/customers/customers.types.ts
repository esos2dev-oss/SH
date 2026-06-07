export type DocKind = 'dni' | 'pasaporte' | 'cedula' | 'licencia' | 'otro';

export interface CustomerRow {
  id: number;
  nombres: string;
  apellidos: string;
  doc_kind: DocKind;
  doc_numero: string;
  email: string | null;
  telefono: string | null;
  fecha_nacimiento: Date | null;
  nacionalidad: string | null;
  direccion: string | null;
  preferencias: Record<string, unknown>;
  notas: string | null;
  accepts_marketing: boolean;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CustomerWithStats extends CustomerRow {
  total_estancias: string;
  total_gastado: string | null;
}
