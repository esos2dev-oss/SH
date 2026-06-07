// Servicio de audit log. Llamarse desde services tras acciones sensibles.

import type { PoolClient } from 'pg';
import { pool } from '../config/db.js';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'status_change'
  | 'permission_change'
  | 'export';

export interface AuditEntry {
  userId: number | null;
  action: AuditAction;
  entity: string;
  entityId?: number | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export async function logAudit(entry: AuditEntry, client?: PoolClient): Promise<void> {
  const sql = `
    INSERT INTO audit_log (user_id, action, entity, entity_id, before, after, ip, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;
  const params = [
    entry.userId,
    entry.action,
    entry.entity,
    entry.entityId ?? null,
    entry.before === undefined ? null : JSON.stringify(entry.before),
    entry.after === undefined ? null : JSON.stringify(entry.after),
    entry.ip ?? null,
    entry.userAgent ?? null,
  ];
  if (client) {
    await client.query(sql, params);
  } else {
    await pool.query(sql, params);
  }
}
