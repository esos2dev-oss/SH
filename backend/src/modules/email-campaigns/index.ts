// Modulo email-campaigns: campañas + envio + logs.

import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../../shared/config/db.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import { logAudit } from '../../shared/services/audit.service.js';
import { renderTemplate, sendEmail } from '../../shared/services/email.service.js';
import { logger } from '../../shared/utils/logger.js';

const EVENTS = ['bienvenida', 'post_estancia', 'fecha_especial', 'recuperacion', 'manual'] as const;
const STATUSES = ['borrador', 'programada', 'enviando', 'enviada', 'cancelada'] as const;

const createSchema = z.object({
  nombre: z.string().trim().min(2).max(150),
  template_id: z.coerce.number().int().positive(),
  event: z.enum(EVENTS).default('manual'),
  segmento: z.record(z.unknown()).default({}),
  programada_para: z.string().datetime({ offset: true }).optional().nullable(),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

interface CampaignRow {
  id: number;
  nombre: string;
  template_id: number;
  event: string;
  segmento: Record<string, unknown>;
  programada_para: Date | null;
  status: string;
  total_destinatarios: number;
  total_enviados: number;
  total_aperturas: number;
  total_rebotes: number;
  created_by: number;
  created_at: Date;
  sent_at: Date | null;
}

const router = Router();
router.use(verifyToken);
router.use(roleGuard(['superadmin', 'admin']));

router.get('/', asyncHandler(async (req, res) => {
  const { status, event } = req.query;
  const where: string[] = [];
  const params: unknown[] = [];
  if (typeof status === 'string' && (STATUSES as readonly string[]).includes(status)) {
    params.push(status); where.push(`status = $${params.length}`);
  }
  if (typeof event === 'string' && (EVENTS as readonly string[]).includes(event)) {
    params.push(event); where.push(`event = $${params.length}`);
  }
  const { rows } = await pool.query<CampaignRow>(
    `SELECT * FROM email_campaigns ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`,
    params,
  );
  ok(res, rows.map(toPublic));
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const input = createSchema.parse(req.body);
  const { rows: tplRows } = await pool.query(`SELECT id FROM email_templates WHERE id = $1 AND active = true`, [input.template_id]);
  if (!tplRows.length) throw Errors.notFound('Plantilla no encontrada o inactiva');

  const { rows } = await pool.query<CampaignRow>(
    `INSERT INTO email_campaigns (nombre, template_id, event, segmento, programada_para, status, created_by)
     VALUES ($1, $2, $3, $4, $5, 'borrador', $6) RETURNING *`,
    [input.nombre, input.template_id, input.event, JSON.stringify(input.segmento), input.programada_para ?? null, req.user.id],
  );
  const created = rows[0]!;
  await logAudit({ userId: req.user.id, action: 'create', entity: 'email_campaigns', entityId: created.id, after: { nombre: input.nombre } });
  ok(res, toPublic(created), 201);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { rows } = await pool.query<CampaignRow>(`SELECT * FROM email_campaigns WHERE id = $1`, [id]);
  if (!rows[0]) throw Errors.notFound();
  ok(res, toPublic(rows[0]));
}));

router.get('/:id/logs', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { rows } = await pool.query(
    `SELECT id, customer_id, email, asunto, status, provider_id, sent_at, opened_at, error_msg, created_at
       FROM email_logs WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [id],
  );
  ok(res, rows);
}));

router.post('/:id/cancel', asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  const { rowCount } = await pool.query(
    `UPDATE email_campaigns SET status = 'cancelada' WHERE id = $1 AND status IN ('borrador','programada')`,
    [id],
  );
  if ((rowCount ?? 0) === 0) throw Errors.validation('Solo se puede cancelar campañas en borrador o programadas');
  await logAudit({ userId: req.user.id, action: 'update', entity: 'email_campaigns', entityId: id, after: { status: 'cancelada' } });
  ok(res, { message: 'Campaña cancelada' });
}));

router.post('/:id/send-now', asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  const result = await sendCampaignNow(id, req.user.id);
  ok(res, result);
}));

async function sendCampaignNow(id: number, actorId: number): Promise<{ campaign_id: number; total: number; enviados: number; fallidos: number }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<CampaignRow & { tpl_asunto: string; tpl_html: string; tpl_text: string | null }>(
      `SELECT c.*,
              t.asunto AS tpl_asunto, t.body_html AS tpl_html, t.body_text AS tpl_text
         FROM email_campaigns c
         JOIN email_templates t ON t.id = c.template_id
        WHERE c.id = $1`,
      [id],
    );
    const camp = rows[0];
    if (!camp) throw Errors.notFound('Campaña no encontrada');
    if (!['borrador', 'programada'].includes(camp.status)) {
      throw Errors.validation(`Solo se pueden enviar borradores/programadas (estado actual: ${camp.status})`);
    }

    // Resolver destinatarios segun segmento.type
    const segType = (camp.segmento as { type?: string }).type ?? 'all';
    const customerWhere: string[] = ['c.active = true', 'c.email IS NOT NULL'];
    if (segType !== 'all') customerWhere.push('c.accepts_marketing = true');
    if (segType === 'inactivos') {
      customerWhere.push(`(c.id IN (
        SELECT cu.id FROM customers cu
          LEFT JOIN bookings b ON b.customer_id = cu.id AND b.status IN ('finalizada','en_curso')
         GROUP BY cu.id
        HAVING (MAX(b.fecha_salida) IS NULL OR MAX(b.fecha_salida) < NOW() - INTERVAL '90 days')
      ))`);
    }
    if (segType === 'vip') {
      customerWhere.push(`(c.id IN (
        SELECT cu.id FROM customers cu
          JOIN bookings b ON b.customer_id = cu.id AND b.status IN ('finalizada','en_curso')
         GROUP BY cu.id HAVING COUNT(b.id) >= 3
      ))`);
    }
    if (segType === 'birthdays_month') {
      customerWhere.push(`EXTRACT(MONTH FROM c.fecha_nacimiento) = EXTRACT(MONTH FROM NOW())`);
    }
    const { rows: targets } = await client.query<{ id: number; nombres: string; apellidos: string; email: string }>(
      `SELECT c.id, c.nombres, c.apellidos, c.email FROM customers c
        WHERE ${customerWhere.join(' AND ')}
        LIMIT 500`,
    );

    await client.query(
      `UPDATE email_campaigns SET status = 'enviando', total_destinatarios = $1 WHERE id = $2`,
      [targets.length, id],
    );

    let enviados = 0;
    let fallidos = 0;
    for (const t of targets) {
      const data = {
        customer: { nombres: t.nombres, apellidos: t.apellidos, email: t.email },
        hotel: { nombre: 'Sistema Hotelero' },
      };
      const asunto = renderTemplate(camp.tpl_asunto, data);
      const html = renderTemplate(camp.tpl_html, data);
      const text = camp.tpl_text ? renderTemplate(camp.tpl_text, data) : undefined;

      const sent = await sendEmail({ to: t.email, subject: asunto, html, ...(text && { text }) });
      const status = sent.ok ? 'enviado' : 'fallido';
      await client.query(
        `INSERT INTO email_logs (campaign_id, customer_id, email, asunto, event, status, provider_id, sent_at, error_msg)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $6 = 'enviado' THEN NOW() ELSE NULL END, $8)`,
        [id, t.id, t.email, asunto, camp.event, status, sent.providerId ?? null, sent.error ?? null],
      );
      if (sent.ok) enviados++; else fallidos++;
    }

    await client.query(
      `UPDATE email_campaigns SET status = 'enviada', total_enviados = $1, sent_at = NOW() WHERE id = $2`,
      [enviados, id],
    );

    await logAudit(
      {
        userId: actorId,
        action: 'update',
        entity: 'email_campaigns',
        entityId: id,
        after: { status: 'enviada', total_destinatarios: targets.length, enviados, fallidos },
      },
      client,
    );

    logger.info({ campaign_id: id, total: targets.length, enviados, fallidos }, 'Campaña enviada');
    return { campaign_id: id, total: targets.length, enviados, fallidos };
  });
}

function toPublic(c: CampaignRow) {
  return {
    id: c.id, nombre: c.nombre, template_id: c.template_id, event: c.event,
    segmento: c.segmento,
    programada_para: c.programada_para?.toISOString() ?? null,
    status: c.status,
    total_destinatarios: c.total_destinatarios,
    total_enviados: c.total_enviados,
    total_aperturas: c.total_aperturas,
    total_rebotes: c.total_rebotes,
    created_by: c.created_by,
    created_at: c.created_at.toISOString(),
    sent_at: c.sent_at?.toISOString() ?? null,
  };
}

export default { prefix: '/api/email-campaigns', router };
