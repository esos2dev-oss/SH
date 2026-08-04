import { supabase } from '../../../shared/lib/supabase';
import type { PaginatedResponse } from '../../../shared/api/client';

export type DocKind = 'dni' | 'pasaporte' | 'cedula' | 'licencia' | 'otro';

export type ReferralSource =
  | 'instagram'
  | 'facebook'
  | 'google'
  | 'recomendacion'
  | 'calle'
  | 'recurrente'
  | 'otro';

export const REFERRAL_SOURCE_LABELS: Record<ReferralSource, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  google: 'Google',
  recomendacion: 'Recomendación',
  calle: 'Pasó por la calle',
  recurrente: 'Cliente recurrente',
  otro: 'Otro',
};

export interface Customer {
  id: number;
  nombres: string;
  apellidos: string;
  doc_kind: DocKind;
  doc_numero: string;
  email: string | null;
  telefono: string | null;
  fecha_nacimiento: string | null;
  nacionalidad: string | null;
  direccion: string | null;
  vehicle_plate: string | null;
  referral_source: ReferralSource | null;
  referral_other: string | null;
  preferencias: Record<string, unknown>;
  notas: string | null;
  accepts_marketing: boolean;
  active: boolean;
  total_estancias: number;
  total_gastado: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerTimeline {
  bookings: Array<{ id: number; codigo: string; fecha_entrada: string; fecha_salida: string; status: string; importe_total: string; moneda: string; room_numero: string }>;
  emails: Array<{ id: number; asunto: string; event: string; status: string; sent_at: string | null; created_at: string }>;
}

/**
 * Normaliza un termino de busqueda igual que la columna `search_text` de la BD:
 * minusculas y sin tildes.
 *
 * Sin esto, buscar "Maria" no encontraba a "María" (ilike es sensible a
 * tildes) y buscar "TEST Maria" no encontraba nada porque el filtro anterior
 * comparaba campo por campo y ninguna columna sola contiene el nombre completo.
 */
export function normalizeSearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export async function listCustomers(params?: { search?: string; doc_kind?: DocKind; segment?: 'vip' | 'inactivos' | 'birthdays_month' | 'recientes'; accepts_marketing?: boolean; page?: number; limit?: number }): Promise<PaginatedResponse<Customer[]>> {
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase.from('customers_with_stats').select('*', { count: 'exact' }).eq('active', true).order('apellidos').order('nombres').range(from, to);
  if (params?.doc_kind) q = q.eq('doc_kind', params.doc_kind);
  if (params?.accepts_marketing !== undefined) q = q.eq('accepts_marketing', params.accepts_marketing);
  if (params?.search) {
    // search_text = nombres + apellidos + documento + email + telefono + placa,
    // en minusculas y sin tildes (columna generada). Cada palabra del termino
    // debe aparecer, en cualquier orden: "maria gonzalez" y "gonzalez maria"
    // encuentran lo mismo.
    const words = normalizeSearch(params.search).split(' ').filter(Boolean);
    for (const w of words) {
      q = q.ilike('search_text', `%${w}%`);
    }
  }
  const { data, error, count } = await q;
  if (error) throw error;

  return {
    data: (data ?? []) as Customer[],
    pagination: {
      total: count ?? 0,
      page, limit,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
    },
  };
}

export async function getCustomer(id: number): Promise<Customer> {
  const { data, error } = await supabase.from('customers_with_stats').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as Customer;
}

export async function getCustomerTimeline(id: number): Promise<CustomerTimeline> {
  const { data, error } = await supabase.rpc('customer_timeline', { p_id: id });
  if (error) throw new Error(error.message);
  return data as CustomerTimeline;
}

export async function createCustomer(data: Partial<Customer> & { nombres: string; apellidos: string; doc_kind: DocKind; doc_numero: string }): Promise<Customer> {
  const { data: row, error } = await supabase.from('customers').insert({
    nombres: data.nombres,
    apellidos: data.apellidos,
    doc_kind: data.doc_kind,
    doc_numero: data.doc_numero,
    email: data.email ?? null,
    telefono: data.telefono ?? null,
    fecha_nacimiento: data.fecha_nacimiento ?? null,
    nacionalidad: data.nacionalidad ?? null,
    direccion: data.direccion ?? null,
    vehicle_plate: data.vehicle_plate ?? null,
    referral_source: data.referral_source ?? null,
    referral_other: data.referral_other ?? null,
    preferencias: data.preferencias ?? {},
    notas: data.notas ?? null,
    accepts_marketing: data.accepts_marketing ?? false,
  }).select('*').single();
  if (error) {
    // 23505 = unique_violation. UNIQUE constraint en (doc_kind, doc_numero).
    if ((error as { code?: string }).code === '23505') {
      throw new Error(`Ya existe un huesped con ${data.doc_kind} ${data.doc_numero}. Usa "Buscar existente".`);
    }
    throw new Error(error.message);
  }
  return { ...(row as Customer), total_estancias: 0, total_gastado: 0 };
}

export async function updateCustomer(id: number, data: Partial<Customer>): Promise<Customer> {
  const allowed = ['nombres','apellidos','doc_kind','doc_numero','email','telefono','fecha_nacimiento','nacionalidad','direccion','vehicle_plate','referral_source','referral_other','preferencias','notas','accepts_marketing','active'] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if ((data as Record<string, unknown>)[k] !== undefined) patch[k] = (data as Record<string, unknown>)[k];
  }
  const { error } = await supabase.from('customers').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  return getCustomer(id);
}

export async function deleteCustomer(id: number): Promise<void> {
  const { error } = await supabase.from('customers').update({ active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}
