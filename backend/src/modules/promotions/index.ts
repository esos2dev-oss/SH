// Modulo promotions: CRUD + validacion de codigo.

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../shared/config/db.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import { logAudit } from '../../shared/services/audit.service.js';

const KINDS = ['porcentaje', 'monto_fijo'] as const;

const createSchema = z.object({
  codigo: z.string().trim().min(2).max(50).toUpperCase(),
  nombre: z.string().trim().min(2).max(150),
  descripcion: z.string().trim().max(2000).optional().nullable(),
  kind: z.enum(KINDS),
  valor: z.coerce.number().positive(),
  moneda: z.string().length(3).optional().nullable(),
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  max_usos: z.coerce.number().int().positive().optional().nullable(),
  condiciones: z.record(z.unknown()).default({}),
}).refine((d) => new Date(d.fecha_fin) >= new Date(d.fecha_inicio), {
  message: 'fecha_fin debe ser >= fecha_inicio',
  path: ['fecha_fin'],
}).refine((d) => d.kind !== 'porcentaje' || d.valor <= 100, {
  message: 'porcentaje debe ser <= 100',
  path: ['valor'],
});

const updateSchema = createSchema.innerType().innerType().partial().extend({ active: z.boolean().optional() });

const validateSchema = z.object({
  codigo: z.string().trim().min(1),
  room_id: z.coerce.number().int().positive().optional(),
  fecha_entrada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fecha_salida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const listQuerySchema = z.object({
  active: z.union([z.literal('true'), z.literal('false')]).optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  codigo: z.string().trim().optional(),
  kind: z.enum(KINDS).optional(),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

interface PromotionRow {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  kind: 'porcentaje' | 'monto_fijo';
  valor: string;
  moneda: string | null;
  fecha_inicio: Date;
  fecha_fin: Date;
  max_usos: number | null;
  usos_actuales: number;
  condiciones: Record<string, unknown>;
  active: boolean;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}

const router = Router();
router.use(verifyToken);

router.get('/', roleGuard(['superadmin', 'admin']), asyncHandler(async (req, res) => {
  const q = listQuerySchema.parse(req.query);
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.active !== undefined) { params.push(q.active); where.push(`active = $${params.length}`); }
  if (q.codigo) { params.push(`%${q.codigo.toUpperCase()}%`); where.push(`codigo LIKE $${params.length}`); }
  if (q.kind) { params.push(q.kind); where.push(`kind = $${params.length}`); }
  const sql = `SELECT * FROM promotions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
  const { rows } = await pool.query<PromotionRow>(sql, params);
  ok(res, rows.map(toPublic));
}));

router.post('/', roleGuard(['superadmin', 'admin']), asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const input = createSchema.parse(req.body);
  const { rows: existing } = await pool.query(`SELECT 1 FROM promotions WHERE codigo = $1 LIMIT 1`, [input.codigo]);
  if (existing.length) throw Errors.conflict('Ya existe una promocion con ese codigo');

  const { rows } = await pool.query<PromotionRow>(
    `INSERT INTO promotions (codigo, nombre, descripcion, kind, valor, moneda, fecha_inicio, fecha_fin,
                             max_usos, condiciones, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      input.codigo, input.nombre, input.descripcion ?? null, input.kind, input.valor,
      input.moneda ?? null, input.fecha_inicio, input.fecha_fin,
      input.max_usos ?? null, JSON.stringify(input.condiciones), req.user.id,
    ],
  );
  const created = rows[0]!;
  await logAudit({ userId: req.user.id, action: 'create', entity: 'promotions', entityId: created.id, after: { codigo: input.codigo } });
  ok(res, toPublic(created), 201);
}));

router.get('/:id', roleGuard(['superadmin', 'admin']), asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { rows } = await pool.query<PromotionRow>(`SELECT * FROM promotions WHERE id = $1`, [id]);
  if (!rows[0]) throw Errors.notFound();
  ok(res, toPublic(rows[0]));
}));

router.patch('/:id', roleGuard(['superadmin', 'admin']), asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  const input = updateSchema.parse(req.body);
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    params.push(k === 'condiciones' ? JSON.stringify(v) : v);
    sets.push(`${k} = $${params.length}`);
  }
  if (!sets.length) {
    const { rows } = await pool.query<PromotionRow>(`SELECT * FROM promotions WHERE id = $1`, [id]);
    if (!rows[0]) throw Errors.notFound();
    ok(res, toPublic(rows[0])); return;
  }
  params.push(id);
  const { rows } = await pool.query<PromotionRow>(
    `UPDATE promotions SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  if (!rows[0]) throw Errors.notFound();
  await logAudit({ userId: req.user.id, action: 'update', entity: 'promotions', entityId: id });
  ok(res, toPublic(rows[0]));
}));

router.delete('/:id', roleGuard(['superadmin', 'admin']), asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  const { rowCount } = await pool.query(`UPDATE promotions SET active = false WHERE id = $1 AND active = true`, [id]);
  if ((rowCount ?? 0) === 0) throw Errors.notFound();
  await logAudit({ userId: req.user.id, action: 'delete', entity: 'promotions', entityId: id });
  ok(res, { message: 'Promocion desactivada' });
}));

router.post('/validate', asyncHandler(async (req, res) => {
  const input = validateSchema.parse(req.body);
  const { rows } = await pool.query<PromotionRow>(
    `SELECT * FROM promotions
      WHERE codigo = $1 AND active = true
        AND fecha_inicio <= $2::date AND fecha_fin >= $2::date
      LIMIT 1`,
    [input.codigo.toUpperCase(), input.fecha_entrada],
  );
  const promo = rows[0];
  if (!promo) {
    ok(res, { valid: false, reason: 'Codigo invalido o expirado' });
    return;
  }
  if (promo.max_usos !== null && promo.usos_actuales >= promo.max_usos) {
    ok(res, { valid: false, reason: 'Limite de usos alcanzado' });
    return;
  }
  // Validacion simple de noches minimas si esta en condiciones
  const minNoches = (promo.condiciones as { min_noches?: number }).min_noches;
  if (minNoches) {
    const from = new Date(input.fecha_entrada);
    const to = new Date(input.fecha_salida);
    const noches = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
    if (noches < minNoches) {
      ok(res, { valid: false, reason: `Minimo de noches no cumplido (${minNoches})` });
      return;
    }
  }
  ok(res, { valid: true, promotion: toPublic(promo) });
}));

function toPublic(p: PromotionRow) {
  return {
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    descripcion: p.descripcion,
    kind: p.kind,
    valor: Number(p.valor),
    moneda: p.moneda,
    fecha_inicio: p.fecha_inicio.toISOString().slice(0, 10),
    fecha_fin: p.fecha_fin.toISOString().slice(0, 10),
    max_usos: p.max_usos,
    usos_actuales: p.usos_actuales,
    condiciones: p.condiciones,
    active: p.active,
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  };
}

export default { prefix: '/api/promotions', router };
