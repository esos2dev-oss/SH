import { supabase } from '../../../shared/lib/supabase';

export type AttendanceKind = 'entrada' | 'salida';

export interface AttendanceRow {
  id: number;
  profile_id: string;
  kind: AttendanceKind;
  marcado_at: string;
  notas: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  empleado_nombre?: string;
  empleado_role?: string;
}

export interface StaffCurrentlyIn {
  profile_id: string;
  nombre: string;
  role: string;
  ultima_entrada: string;
}

export interface HoursReportRow {
  prof_id: string;
  nombre: string;
  role: string;
  dias_marcados: number;
  minutos_totales: number;
}

export async function marcar(kind: AttendanceKind, notas?: string | null): Promise<AttendanceRow> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { data, error } = await supabase.from('staff_attendance').insert({
    profile_id: user.id,
    kind,
    user_agent: navigator.userAgent,
    notas: notas ?? null,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return data as AttendanceRow;
}

export async function myLastState(): Promise<AttendanceKind | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('staff_attendance')
    .select('kind').eq('profile_id', user.id).order('marcado_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return null;
  return (data as { kind: AttendanceKind } | null)?.kind ?? null;
}

export async function myHistory(dias = 30): Promise<AttendanceRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const from = new Date(); from.setDate(from.getDate() - dias);
  const { data, error } = await supabase.from('staff_attendance_view')
    .select('*').eq('profile_id', user.id).gte('marcado_at', from.toISOString()).order('marcado_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AttendanceRow[];
}

export async function allHistory(from: string, to: string): Promise<AttendanceRow[]> {
  const { data, error } = await supabase.from('staff_attendance_view')
    .select('*').gte('marcado_at', from + 'T00:00:00').lte('marcado_at', to + 'T23:59:59')
    .order('marcado_at', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as AttendanceRow[];
}

export async function currentlyIn(): Promise<StaffCurrentlyIn[]> {
  const { data, error } = await supabase.rpc('staff_currently_in');
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffCurrentlyIn[];
}

export async function hoursReport(from: string, to: string, profileId?: string): Promise<HoursReportRow[]> {
  const params: Record<string, string | null> = { p_from: from, p_to: to };
  params.p_profile_id = profileId ?? null;
  const { data, error } = await supabase.rpc('staff_hours_report', params);
  if (error) throw new Error(error.message);
  return (data ?? []) as HoursReportRow[];
}
