// Modulo email-templates: CRUD plantillas + preview (render Mustache).

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../shared/config/db.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import { renderTemplate } from '../../shared/services/email.service.js';
import { logAudit } from '../../shared/services/audit.service.js';

const EVENTS = ['bienvenida', 'post_estancia', 'fecha_especial', 'recuperacion', 'manual'] as const;

const createSchema = z.object({
  nombre: z.string().trim().min(2).max(150),
  event: z.enum(EVENTS),
  asunto: z.string().trim().min(1).max(255),
  body_html: z.string().min(1),
  body_text: z.string().optional().nullable(),
  variables: z.array(z.string()).default([]),
});
const updateSchema = createSchema.partial().extend({ active: z.boolean().optional() });

const idParam = z.object({ id: z.coerce.number().int().positive() });

interface TemplateRow {
  id: number;
  nombre: string;
  event: string;
  asunto: string;
  body_html: string;
  body_text: string | null;
  variables: string[];
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

const router = Router();
router.use(verifyToken);
router.use(roleGuard(['superadmin', 'admin']));

router.get('/', asyncHandler(async (req, res) => {
  const event = req.query['event'];
  const params: unknown[] = [];
  let where = '';
  if (typeof event === 'string' && EVENTS.includes(event as never)) {
    params.push(event); where = 'WHERE event = $1';
  }
  const { rows } = await pool.query<TemplateRow>(
    `SELECT * FROM email_templates ${where} ORDER BY nombre`, params,
  );
  ok(res, rows.map(toPublic));
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const input = createSchema.parse(req.body);
  const { rows: existing } = await pool.query(`SELECT 1 FROM email_templates WHERE nombre = $1 LIMIT 1`, [input.nombre]);
  if (existing.length) throw Errors.conflict('Ya existe una plantilla con ese nombre');
  const { rows } = await pool.query<TemplateRow>(
    `INSERT INTO email_templates (nombre, event, asunto, body_html, body_text, variables)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [input.nombre, input.event, input.asunto, input.body_html, input.body_text ?? null, JSON.stringify(input.variables)],
  );
  const created = rows[0]!;
  await logAudit({ userId: req.user.id, action: 'create', entity: 'email_templates', entityId: created.id });
  ok(res, toPublic(created), 201);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { rows } = await pool.query<TemplateRow>(`SELECT * FROM email_templates WHERE id = $1`, [id]);
  if (!rows[0]) throw Errors.notFound();
  ok(res, toPublic(rows[0]));
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  const input = updateSchema.parse(req.body);
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    params.push(k === 'variables' ? JSON.stringify(v) : v);
    sets.push(`${k} = $${params.length}`);
  }
  if (!sets.length) {
    const { rows } = await pool.query<TemplateRow>(`SELECT * FROM email_templates WHERE id = $1`, [id]);
    if (!rows[0]) throw Errors.notFound();
    ok(res, toPublic(rows[0])); return;
  }
  params.push(id);
  const { rows } = await pool.query<TemplateRow>(
    `UPDATE email_templates SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params,
  );
  if (!rows[0]) throw Errors.notFound();
  await logAudit({ userId: req.user.id, action: 'update', entity: 'email_templates', entityId: id });
  ok(res, toPublic(rows[0]));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  const { rowCount } = await pool.query(`UPDATE email_templates SET active = false WHERE id = $1 AND active = true`, [id]);
  if ((rowCount ?? 0) === 0) throw Errors.notFound();
  await logAudit({ userId: req.user.id, action: 'delete', entity: 'email_templates', entityId: id });
  ok(res, { message: 'Plantilla desactivada' });
}));

router.post('/:id/preview', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { rows } = await pool.query<TemplateRow>(`SELECT * FROM email_templates WHERE id = $1`, [id]);
  if (!rows[0]) throw Errors.notFound();
  const sample = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};
  const data = {
    customer: { nombres: 'Maria', apellidos: 'Lopez', email: 'maria@example.com', ...((sample as Record<string, unknown>)['customer'] as object | undefined) },
    booking: { codigo: 'BK-DEMO', fecha_entrada: '2026-06-01', fecha_salida: '2026-06-04', ...((sample as Record<string, unknown>)['booking'] as object | undefined) },
    hotel: { nombre: 'Sistema Hotelero', ...((sample as Record<string, unknown>)['hotel'] as object | undefined) },
    ...sample,
  };
  ok(res, {
    asunto: renderTemplate(rows[0].asunto, data),
    html: renderTemplate(rows[0].body_html, data),
    text: rows[0].body_text ? renderTemplate(rows[0].body_text, data) : null,
  });
}));

function toPublic(t: TemplateRow) {
  return {
    id: t.id, nombre: t.nombre, event: t.event,
    asunto: t.asunto, body_html: t.body_html, body_text: t.body_text,
    variables: t.variables, active: t.active,
    created_at: t.created_at.toISOString(), updated_at: t.updated_at.toISOString(),
  };
}

export default { prefix: '/api/email-templates', router };
