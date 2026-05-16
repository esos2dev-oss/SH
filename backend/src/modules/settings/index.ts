// Modulo settings: clave-valor del hotel.

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../shared/config/db.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import { logAudit } from '../../shared/services/audit.service.js';

const keyParam = z.object({ key: z.string().trim().min(1).max(100) });
const putBody = z.object({ value: z.unknown() });

interface SettingRow {
  key: string;
  value: unknown;
  updated_by: number | null;
  updated_at: Date;
}

const router = Router();
router.use(verifyToken);

router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query<SettingRow>(`SELECT * FROM settings ORDER BY key`);
  ok(res, rows.map((r) => ({ key: r.key, value: r.value, updated_at: r.updated_at.toISOString() })));
}));

router.get('/:key', roleGuard(['superadmin', 'admin']), asyncHandler(async (req, res) => {
  const { key } = keyParam.parse(req.params);
  const { rows } = await pool.query<SettingRow>(`SELECT * FROM settings WHERE key = $1`, [key]);
  if (!rows[0]) throw Errors.notFound();
  ok(res, { key: rows[0].key, value: rows[0].value, updated_at: rows[0].updated_at.toISOString() });
}));

router.put('/:key', roleGuard(['superadmin', 'admin']), asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const { key } = keyParam.parse(req.params);
  const { value } = putBody.parse(req.body);
  const { rows } = await pool.query<SettingRow>(
    `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING *`,
    [key, JSON.stringify(value), req.user.id],
  );
  await logAudit({ userId: req.user.id, action: 'update', entity: 'settings', entityId: null, after: { key, value } });
  ok(res, { key: rows[0]!.key, value: rows[0]!.value, updated_at: rows[0]!.updated_at.toISOString() });
}));

export default { prefix: '/api/settings', router };
