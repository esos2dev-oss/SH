import { api } from '../../../shared/api/client';

export type RoomStatus = 'disponible' | 'ocupada' | 'limpieza' | 'mantenimiento' | 'fuera_servicio';

export interface RoomType {
  id: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
  capacidad: number;
  tarifa_dia: number;
  tarifa_semana: number | null;
  tarifa_mes: number | null;
  moneda: string;
  amenities: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: number;
  numero: string;
  planta: string | null;
  status: RoomStatus;
  notas: string | null;
  photo_url: string | null;
  active: boolean;
  room_type: { id: number; nombre: string; slug: string; tarifa_dia: number; capacidad: number };
  created_at: string;
  updated_at: string;
}

export interface OccupancySummary {
  total: number;
  byStatus: Record<RoomStatus, number>;
  occupancyRate: number;
  byPlanta: Array<{ planta: string | null; total: number; ocupada: number; occupancyRate: number }>;
  byRoomType: Array<{ roomTypeId: number; nombre: string; total: number; ocupada: number }>;
}

// Rooms
export function listRooms(params?: { status?: RoomStatus; room_type_id?: number; planta?: string; search?: string; active?: boolean }) {
  return api.get<Room[]>('/api/rooms', { query: params as Record<string, string | number | boolean | undefined> | undefined });
}
export const getRoom = (id: number) => api.get<Room>(`/api/rooms/${id}`);
export const occupancy = () => api.get<OccupancySummary>('/api/rooms/occupancy');
export const createRoom = (data: Partial<Room> & { numero: string; room_type_id: number }) => api.post<Room>('/api/rooms', data);
export const updateRoom = (id: number, data: Partial<Room>) => api.patch<Room>(`/api/rooms/${id}`, data);
export const updateRoomStatus = (id: number, status: RoomStatus, notas?: string) =>
  api.patch<Room>(`/api/rooms/${id}/status`, { status, notas });
export const deleteRoom = (id: number) => api.delete(`/api/rooms/${id}`);

// Room types
export const listRoomTypes = (params?: { active?: boolean; search?: string }) =>
  api.get<RoomType[]>('/api/room-types', { query: params as Record<string, string | number | boolean | undefined> | undefined });
export const getRoomType = (id: number) => api.get<RoomType>(`/api/room-types/${id}`);
export const createRoomType = (data: Partial<RoomType> & { nombre: string; slug: string; capacidad: number; tarifa_dia: number }) =>
  api.post<RoomType>('/api/room-types', data);
export const updateRoomType = (id: number, data: Partial<RoomType>) => api.patch<RoomType>(`/api/room-types/${id}`, data);
export const deleteRoomType = (id: number) => api.delete(`/api/room-types/${id}`);
