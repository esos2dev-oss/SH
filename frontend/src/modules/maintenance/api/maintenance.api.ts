import { supabase } from '../../../shared/lib/supabase';

export type MaintenanceType = 'electrico' | 'plomeria' | 'aire_acondicionado' | 'muebles' | 'pintura' | 'jardineria' | 'piscina' | 'area_comun' | 'general' | 'otro';
export type MaintenanceStatus = 'pendiente' | 'en_proceso' | 'completado' | 'cancelado';

export const MAINT_TYPE_LABELS: Record<MaintenanceType, string> = {
  electrico: 'Electrico',
  plomeria: 'Plomeria',
  aire_acondicionado: 'Aire acondicionado',
  muebles: 'Muebles',
  pintura: 'Pintura',
  jardineria: 'Jardineria',
  piscina: 'Piscina',
  area_comun: 'Area comun',
  general: 'General',
  otro: 'Otro',
};

export const MAINT_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

export interface MaintenanceOrder {
  id: number;
  room_id: number | null;
  room?: { id: number; numero: string; type: string } | null;
  tipo: MaintenanceType;
  titulo: string;
  descripcion: string | null;
  status: MaintenanceStatus;
  prioridad: 1 | 2 | 3;
  servicio_externo: boolean;
  proveedor_nombre: string | null;
  proveedor_telefono: string | null;
  costo: number | null;
  moneda: string | null;
  reportado_at: string;
  reportado_by: string | null;
  asignado_to: string | null;
  iniciado_at: string | null;
  completado_at: string | null;
  notas_cierre: string | null;
  created_at: string;
  updated_at: string;
}

export async function listMaintenance(params?: { status?: MaintenanceStatus; room_id?: number; externo?: boolean }): Promise<MaintenanceOrder[]> {
  let q = supabase.from('maintenance_orders').select('*, room:rooms(id, numero, room_type:room_types(nombre))').order('reportado_at', { ascending: false }).limit(200);
  if (params?.status) q = q.eq('status', params.status);
  if (params?.room_id) q = q.eq('room_id', params.room_id);
  if (params?.externo !== undefined) q = q.eq('servicio_externo', params.externo);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as (MaintenanceOrder & { room: { id: number; numero: string; room_type: { nombre: string } | null } | null })[])
    .map((o) => ({ ...o, room: o.room ? { id: o.room.id, numero: o.room.numero, type: o.room.room_type?.nombre ?? '' } : null }));
}

export async function createMaintenance(data: {
  room_id?: number | null;
  tipo: MaintenanceType;
  titulo: string;
  descripcion?: string | null;
  prioridad?: 1 | 2 | 3;
  servicio_externo?: boolean;
  proveedor_nombre?: string | null;
  proveedor_telefono?: string | null;
  costo?: number | null;
  moneda?: string | null;
}): Promise<MaintenanceOrder> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { data: row, error } = await supabase.from('maintenance_orders').insert({
    room_id: data.room_id ?? null,
    tipo: data.tipo,
    titulo: data.titulo,
    descripcion: data.descripcion ?? null,
    prioridad: data.prioridad ?? 2,
    servicio_externo: data.servicio_externo ?? false,
    proveedor_nombre: data.proveedor_nombre ?? null,
    proveedor_telefono: data.proveedor_telefono ?? null,
    costo: data.costo ?? null,
    moneda: data.moneda ?? null,
    reportado_by: user.id,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return row as MaintenanceOrder;
}

export async function startMaintenance(id: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('maintenance_orders').update({
    status: 'en_proceso',
    iniciado_at: new Date().toISOString(),
    asignado_to: user?.id ?? null,
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function completeMaintenance(id: number, notas?: string, costo?: number): Promise<void> {
  const patch: Record<string, unknown> = {
    status: 'completado',
    completado_at: new Date().toISOString(),
  };
  if (notas !== undefined) patch.notas_cierre = notas;
  if (costo !== undefined && costo > 0) patch.costo = costo;
  // Si el trigger nunca puso started_at (no se paso por en_proceso), setealo tambien
  patch.iniciado_at = patch.iniciado_at ?? new Date().toISOString();
  const { data: cur } = await supabase.from('maintenance_orders').select('iniciado_at').eq('id', id).single();
  if (cur && !(cur as { iniciado_at: string | null }).iniciado_at) patch.iniciado_at = new Date().toISOString();
  else delete patch.iniciado_at;
  const { error } = await supabase.from('maintenance_orders').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function cancelMaintenance(id: number, motivo?: string): Promise<void> {
  const { error } = await supabase.from('maintenance_orders').update({
    status: 'cancelado',
    notas_cierre: motivo ?? null,
  }).eq('id', id);
  if (error) throw new Error(error.message);
}
