// Modulo ledger-categories: CRUD de categorias de ingresos/egresos.

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../shared/config/db.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import { logAudit } from '../../shared/services/audit.service.js';

const TYPES = ['ingreso', 'egreso'] as const;

const createSchema = z.object({
  nombre: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9_-]+$/),
  type: z.enum(TYPES),
});
const updateSchema = createSchema.partial().extend({ active: z.boolean().optional() });

const idParam = z.object({ id: z.coerce.number().int().positive() });

interface CategoryRow {
  id: number;
  nombre: string;
  slug: string;
  type: 'ingreso' | 'egreso';
  active: boolean;
  created_at: Date;
}

const router = Router();
router.use(verifyToken);

router.get('/', asyncHandler(async (req, res) => {
  const filterType = req.query['type'];
  const filterActive = req.query['active'];
  const where: string[] = [];
  const params: unknown[] = [];
  if (filterType === 'ingreso' || filterType === 'egreso') {
    params.push(filterType); where.push(`type = $${params.length}`);
  }
  if (filterActive === 'true' || filterActive === 'false') {
    params.push(filterActive === 'true'); where.push(`active = $${params.length}`);
  }
  const sql = `SELECT * FROM ledger_categories ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY type, nombre`;
  const { rows } = await pool.query<CategoryRow>(sql, params);
  ok(res, rows.map((r) => ({
    id: r.id, nombre: r.nombre, slug: r.slug, type: r.type, active: r.active,
    created_at: r.created_at.toISOString(),
  })));
}));

router.post('/', roleGuard(['superadmin', 'admin']), asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const input = createSchema.parse(req.body);
  const { rows: existing } = await pool.query(`SELECT 1 FROM ledger_categories WHERE slug = $1 LIMIT 1`, [input.slug]);
  if (existing.length) throw Errors.conflict('Ya existe una categoria con ese slug');
  const { rows } = await pool.query<CategoryRow>(
    `INSERT INTO ledger_categories (nombre, slug, type) VALUES ($1, $2, $3) RETURNING *`,
    [input.nombre, input.slug, input.type],
  );
  const created = rows[0]!;
  await logAudit({ userId: req.user.id, action: 'create', entity: 'ledger_categories', entityId: created.id, after: input });
  ok(res, created, 201);
}));

router.patch('/:id', roleGuard(['superadmin', 'admin']), asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  const input = updateSchema.parse(req.body);
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    params.push(v); sets.push(`${k} = $${params.length}`);
  }
  if (!sets.length) {
    const { rows } = await pool.query<CategoryRow>(`SELECT * FROM ledger_categories WHERE id = $1`, [id]);
    if (!rows[0]) throw Errors.notFound();
    ok(res, rows[0]); return;
  }
  params.push(id);
  const { rows } = await pool.query<CategoryRow>(
    `UPDATE ledger_categories SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  if (!rows[0]) throw Errors.notFound();
  await logAudit({ userId: req.user.id, action: 'update', entity: 'ledger_categories', entityId: id, after: input });
  ok(res, rows[0]);
}));

router.delete('/:id', roleGuard(['superadmin', 'admin']), asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  const { rows: used } = await pool.query(`SELECT 1 FROM ledger_entries WHERE category_id = $1 LIMIT 1`, [id]);
  if (used.length) throw Errors.conflict('No se puede desactivar: tiene asientos asociados');
  const { rowCount } = await pool.query(`UPDATE ledger_categories SET active = false WHERE id = $1 AND active = true`, [id]);
  if ((rowCount ?? 0) === 0) throw Errors.notFound();
  await logAudit({ userId: req.user.id, action: 'delete', entity: 'ledger_categories', entityId: id });
  ok(res, { message: 'Categoria desactivada' });
}));

export default { prefix: '/api/ledger-categories', router };
