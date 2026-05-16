export interface RoomTypeRow {
  id: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
  capacidad: number;
  tarifa_dia: string;
  tarifa_semana: string | null;
  tarifa_mes: string | null;
  moneda: string;
  amenities: string[];
  active: boolean;
  created_at: Date;
  updated_at: Date;
}
