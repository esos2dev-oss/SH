import { supabase } from '../../../shared/lib/supabase';

export type PlantaKind = 'encendido' | 'apagado';

export interface PlantaEvent {
  id: number;
  kind: PlantaKind;
  marcado_at: string;
  marcado_by: string | null;
  motivo: string | null;
  combustible_litros: number | null;
  notas: string | null;
  created_at: string;
  operador_nombre?: string;
  operador_role?: string;
}

export interface PlantaSummary {
  estado_actual: PlantaKind;
  ultimo_evento_at: string | null;
  minutos_encendida: number;
  horas_encendida: number;
  ciclos: number;
  combustible_litros: number;
  from: string;
  to: string;
}

export async function listEvents(from: string, to: string): Promise<PlantaEvent[]> {
  const { data, error } = await supabase.from('planta_events_view')
    .select('*')
    .gte('marcado_at', from + 'T00:00:00')
    .lte('marcado_at', to + 'T23:59:59')
    .order('marcado_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as PlantaEvent[];
}

export async function summary(from: string, to: string): Promise<PlantaSummary> {
  const { data, error } = await supabase.rpc('planta_summary', { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return data as PlantaSummary;
}

export async function marcar(data: {
  kind: PlantaKind;
  motivo?: string | null;
  combustible_litros?: number | null;
  notas?: string | null;
}): Promise<PlantaEvent> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { data: row, error } = await supabase.from('planta_events').insert({
    kind: data.kind,
    marcado_by: user.id,
    motivo: data.motivo ?? null,
    combustible_litros: data.combustible_litros ?? null,
    notas: data.notas ?? null,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return row as PlantaEvent;
}
