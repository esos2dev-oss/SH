import { api } from '../../../shared/api/client';

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout' | 'status_change' | 'permission_change' | 'export';

export interface AuditEntry {
  id: number;
  user_id: number | null;
  user_nombre: string | null;
  action: AuditAction;
  entity: string;
  entity_id: number | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export const listAudit = (params?: {
  user_id?: number; action?: AuditAction; entity?: string; entity_id?: number;
  dateFrom?: string; dateTo?: string; page?: number; limit?: number;
}) => api.getPaginated<AuditEntry[]>('/api/audit-log', { query: params as Record<string, string | number | boolean | undefined> | undefined });

export const getAuditEntry = (id: number) => api.get<AuditEntry>(`/api/audit-log/${id}`);
