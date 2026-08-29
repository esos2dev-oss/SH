import { supabase } from '../../../shared/lib/supabase';
import { cached, invalidate } from '../../../shared/lib/cached';

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
  tarifa_dia_bs: number | null;
  tarifa_semana_bs: number | null;
  tarifa_mes_bs: number | null;
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

const ROOM_SELECT = `
  id, numero, planta, status, notas, photo_url, active, created_at, updated_at,
  room_type:room_types ( id, nombre, slug, tarifa_dia, capacidad )
`;

// ---------- Rooms ----------
export async function listRooms(params?: { status?: RoomStatus; room_type_id?: number; planta?: string; search?: string; active?: boolean }): Promise<Room[]> {
  let q = supabase.from('rooms').select(ROOM_SELECT).order('numero');
  if (params?.status) q = q.eq('status', params.status);
  if (params?.room_type_id) q = q.eq('room_type_id', params.room_type_id);
  if (params?.planta) q = q.eq('planta', params.planta);
  if (params?.active !== undefined) q = q.eq('active', params.active);
  if (params?.search) q = q.ilike('numero', `%${params.search}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Room[];
}

export async function getRoom(id: number): Promise<Room> {
  const { data, error } = await supabase.from('rooms').select(ROOM_SELECT).eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as unknown as Room;
}

export async function occupancy(): Promise<OccupancySummary> {
  const { data, error } = await supabase
    .from('rooms')
    .select('id, planta, status, room_type:room_types(id, nombre)')
    .eq('active', true);
  if (error) throw new Error(error.message);
  type Row = { id: number; planta: string | null; status: RoomStatus; room_type: { id: number; nombre: string } | null };
  const rows = (data ?? []) as unknown as Row[];

  const byStatus = { disponible: 0, ocupada: 0, limpieza: 0, mantenimiento: 0, fuera_servicio: 0 } as Record<RoomStatus, number>;
  const plantaMap = new Map<string | null, { total: number; ocupada: number }>();
  const typeMap = new Map<number, { nombre: string; total: number; ocupada: number }>();

  for (const r of rows) {
    byStatus[r.status]++;
    const p = plantaMap.get(r.planta) ?? { total: 0, ocupada: 0 };
    p.total++; if (r.status === 'ocupada') p.ocupada++;
    plantaMap.set(r.planta, p);
    if (r.room_type) {
      const t = typeMap.get(r.room_type.id) ?? { nombre: r.room_type.nombre, total: 0, ocupada: 0 };
      t.total++; if (r.status === 'ocupada') t.ocupada++;
      typeMap.set(r.room_type.id, t);
    }
  }
  const total = rows.length;
  const occupancyRate = total === 0 ? 0 : Math.round((byStatus.ocupada / total) * 100);

  return {
    total,
    byStatus,
    occupancyRate,
    byPlanta: Array.from(plantaMap, ([planta, v]) => ({
      planta, total: v.total, ocupada: v.ocupada,
      occupancyRate: v.total === 0 ? 0 : Math.round((v.ocupada / v.total) * 100),
    })),
    byRoomType: Array.from(typeMap, ([roomTypeId, v]) => ({ roomTypeId, nombre: v.nombre, total: v.total, ocupada: v.ocupada })),
  };
}

export async function createRoom(data: Partial<Room> & { numero: string; room_type_id: number }): Promise<Room> {
  const insert = {
    numero: data.numero,
    room_type_id: data.room_type_id,
    planta: data.planta ?? null,
    status: data.status ?? 'disponible',
    notas: data.notas ?? null,
    photo_url: data.photo_url ?? null,
    active: data.active ?? true,
  };
  const { data: row, error } = await supabase.from('rooms').insert(insert).select(ROOM_SELECT).single();
  if (error) throw new Error(error.message);
  return row as unknown as Room;
}

export async function updateRoom(id: number, data: Partial<Room> & { room_type_id?: number }): Promise<Room> {
  const patch: Record<string, unknown> = {};
  for (const k of ['numero', 'planta', 'status', 'notas', 'photo_url', 'active', 'room_type_id'] as const) {
    if ((data as Record<string, unknown>)[k] !== undefined) patch[k] = (data as Record<string, unknown>)[k];
  }
  const { data: row, error } = await supabase.from('rooms').update(patch).eq('id', id).select(ROOM_SELECT).single();
  if (error) throw new Error(error.message);
  return row as unknown as Room;
}

export async function updateRoomStatus(id: number, status: RoomStatus, notas?: string): Promise<Room> {
  const patch: Record<string, unknown> = { status };
  if (notas !== undefined) patch.notas = notas;
  const { data, error } = await supabase.from('rooms').update(patch).eq('id', id).select(ROOM_SELECT).single();
  if (error) throw new Error(error.message);
  return data as unknown as Room;
}

export async function deleteRoom(id: number): Promise<void> {
  const { error } = await supabase.from('rooms').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------- Room types ----------
export async function listRoomTypes(params?: { active?: boolean; search?: string }): Promise<RoomType[]> {
  // Cache: 5 minutos. Room types cambian raramente.
  // Solo cacheamos la variante "active=true, sin search" (la que se usa en 90% de casos).
  if (params?.active === true && !params.search) {
    return cached('room_types:active', 5 * 60_000, async () => {
      const { data, error } = await supabase.from('room_types').select('*').eq('active', true).order('nombre');
      if (error) throw new Error(error.message);
      return (data ?? []) as RoomType[];
    });
  }
  let q = supabase.from('room_types').select('*').order('nombre');
  if (params?.active !== undefined) q = q.eq('active', params.active);
  if (params?.search) q = q.ilike('nombre', `%${params.search}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as RoomType[];
}

export async function getRoomType(id: number): Promise<RoomType> {
  const { data, error } = await supabase.from('room_types').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as RoomType;
}

export async function createRoomType(data: Partial<RoomType> & { nombre: string; slug: string; capacidad: number; tarifa_dia: number }): Promise<RoomType> {
  const { data: row, error } = await supabase.from('room_types').insert({
    nombre: data.nombre,
    slug: data.slug,
    descripcion: data.descripcion ?? null,
    capacidad: data.capacidad,
    tarifa_dia: data.tarifa_dia,
    tarifa_semana: data.tarifa_semana ?? null,
    tarifa_mes: data.tarifa_mes ?? null,
    tarifa_dia_bs: data.tarifa_dia_bs ?? null,
    tarifa_semana_bs: data.tarifa_semana_bs ?? null,
    tarifa_mes_bs: data.tarifa_mes_bs ?? null,
    moneda: data.moneda ?? 'EUR',
    amenities: data.amenities ?? [],
    active: data.active ?? true,
  }).select('*').single();
  if (error) throw new Error(error.message);
  invalidate('room_types:active');
  return row as RoomType;
}

export async function updateRoomType(id: number, data: Partial<RoomType>): Promise<RoomType> {
  const patch: Record<string, unknown> = {};
  for (const k of ['nombre', 'slug', 'descripcion', 'capacidad', 'tarifa_dia', 'tarifa_semana', 'tarifa_mes', 'tarifa_dia_bs', 'tarifa_semana_bs', 'tarifa_mes_bs', 'moneda', 'amenities', 'active'] as const) {
    if ((data as Record<string, unknown>)[k] !== undefined) patch[k] = (data as Record<string, unknown>)[k];
  }
  const { data: row, error } = await supabase.from('room_types').update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  invalidate('room_types:active');
  return row as RoomType;
}

export async function deleteRoomType(id: number): Promise<void> {
  const { error } = await supabase.from('room_types').delete().eq('id', id);
  if (error) throw new Error(error.message);
  invalidate('room_types:active');
}
