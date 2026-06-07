// Modulo audit-log: solo lectura.

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../shared/config/db.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { ok, paginated, buildPagination } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';

const ACTIONS = ['create', 'update', 'delete', 'login', 'logout', 'status_change', 'permission_change', 'export'] as const;

const listQuerySchema = z.object({
  user_id: z.coerce.number().int().positive().optional(),
  action: z.enum(ACTIONS).optional(),
  entity: z.string().trim().optional(),
  entity_id: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

interface AuditRow {
  id: number;
  user_id: number | null;
  action: string;
  entity: string;
  entity_id: number | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
  user_nombre: string | null;
}

const router = Router();
router.use(verifyToken);
router.use(roleGuard(['superadmin', 'admin']));

router.get('/', asyncHandler(async (req, res) => {
  const q = listQuerySchema.parse(req.query);
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.user_id) { params.push(q.user_id); where.push(`a.user_id = $${params.length}`); }
  if (q.action) { params.push(q.action); where.push(`a.action = $${params.length}`); }
  if (q.entity) { params.push(q.entity); where.push(`a.entity = $${params.length}`); }
  if (q.entity_id) { params.push(q.entity_id); where.push(`a.entity_id = $${params.length}`); }
  if (q.dateFrom) { params.push(q.dateFrom); where.push(`a.created_at >= $${params.length}::date`); }
  if (q.dateTo) { params.push(q.dateTo); where.push(`a.created_at <= $${params.length}::date + INTERVAL '1 day'`); }
  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const { rows: countRows } = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM audit_log a ${whereSQL}`, params,
  );
  const total = countRows[0]?.total ?? 0;

  const offset = (q.page - 1) * q.limit;
  params.push(q.limit, offset);
  const { rows } = await pool.query<AuditRow>(
    `SELECT a.*, u.nombre AS user_nombre
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       ${whereSQL}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  paginated(res, rows.map(toPublic), buildPagination(total, q.page, q.limit));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { rows } = await pool.query<AuditRow>(
    `SELECT a.*, u.nombre AS user_nombre
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.id = $1`,
    [id],
  );
  if (!rows[0]) throw Errors.notFound();
  ok(res, toPublic(rows[0]));
}));

function toPublic(a: AuditRow) {
  return {
    id: a.id,
    user_id: a.user_id,
    user_nombre: a.user_nombre,
    action: a.action,
    entity: a.entity,
    entity_id: a.entity_id,
    before: a.before,
    after: a.after,
    ip: a.ip,
    user_agent: a.user_agent,
    created_at: a.created_at.toISOString(),
  };
}

export default { prefix: '/api/audit-log', router };
