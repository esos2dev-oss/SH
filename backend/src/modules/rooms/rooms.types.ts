export type RoomStatus = 'disponible' | 'ocupada' | 'limpieza' | 'mantenimiento' | 'fuera_servicio';

export interface RoomRow {
  id: number;
  numero: string;
  room_type_id: number;
  planta: string | null;
  status: RoomStatus;
  notas: string | null;
  photo_url: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RoomWithType extends RoomRow {
  room_type_nombre: string;
  room_type_slug: string;
  tarifa_dia: string;
  capacidad: number;
}

export interface OccupancyByStatus {
  disponible: number;
  ocupada: number;
  limpieza: number;
  mantenimiento: number;
  fuera_servicio: number;
}

export interface OccupancyByPlanta {
  planta: string | null;
  total: number;
  ocupada: number;
  occupancyRate: number;
}

export interface OccupancyByRoomType {
  roomTypeId: number;
  nombre: string;
  total: number;
  ocupada: number;
}

export interface OccupancySummary {
  total: number;
  byStatus: OccupancyByStatus;
  occupancyRate: number;
  byPlanta: OccupancyByPlanta[];
  byRoomType: OccupancyByRoomType[];
}
