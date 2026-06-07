import { supabase } from '../../../shared/lib/supabase';
import type { PaginatedResponse } from '../../../shared/api/client';

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout' | 'status_change' | 'permission_change' | 'export';

export interface AuditEntry {
  id: number;
  user_id: string | null;
  user_nombre: string | null;
  action: AuditAction;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export async function listAudit(params?: {
  user_id?: string; action?: AuditAction; entity?: string; entity_id?: string;
  dateFrom?: string; dateTo?: string; page?: number; limit?: number;
}): Promise<PaginatedResponse<AuditEntry[]>> {
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 50;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  let q = supabase.from('audit_log').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
  if (params?.user_id)   q = q.eq('user_id', params.user_id);
  if (params?.action)    q = q.eq('action', params.action);
  if (params?.entity)    q = q.eq('entity', params.entity);
  if (params?.entity_id) q = q.eq('entity_id', params.entity_id);
  if (params?.dateFrom)  q = q.gte('created_at', params.dateFrom);
  if (params?.dateTo)    q = q.lte('created_at', params.dateTo);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return {
    data: ((data ?? []) as Array<Omit<AuditEntry, 'user_nombre'>>).map((e) => ({ ...e, user_nombre: null })),
    pagination: { total: count ?? 0, page, limit, totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)) },
  };
}

export async function getAuditEntry(id: number): Promise<AuditEntry> {
  const { data, error } = await supabase.from('audit_log').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return { ...(data as Omit<AuditEntry, 'user_nombre'>), user_nombre: null };
}
