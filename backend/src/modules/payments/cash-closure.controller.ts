// Controllers HTTP del sub-modulo cierre de caja.

import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import * as service from './cash-closure.service.js';

const isoDateTime = z.string().datetime({ offset: true });
const idParam = z.object({ id: z.coerce.number().int().positive() });

const previewQuery = z.object({
  opened_at: isoDateTime,
  closed_at: isoDateTime.optional(),
  user_id: z.coerce.number().int().positive().optional(),
});

const commitBody = z.object({
  opened_at: isoDateTime,
  closed_at: isoDateTime.optional(),
  user_id: z.coerce.number().int().positive().optional(),
  notas: z.string().trim().max(1000).optional().nullable(),
  signature_url: z.string().trim().url().optional().nullable(),
});

const listQuery = z.object({
  user_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

/** Solo recepcion puede operar caja propia; resto puede operar caja de cualquier user. */
function actorScopedUserId(req: Request, requested: number | undefined): number {
  if (!req.user) throw Errors.unauthorized();
  if (req.user.role === 'recepcion') return req.user.id;
  return requested ?? req.user.id;
}

export async function preview(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const q = previewQuery.parse(req.query);
  const userId = actorScopedUserId(req, q.user_id);
  const closedAt = q.closed_at ?? new Date().toISOString();
  ok(res, await service.preview(userId, q.opened_at, closedAt));
}

export async function close(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const b = commitBody.parse(req.body);
  const userId = actorScopedUserId(req, b.user_id);
  const closedAt = b.closed_at ?? new Date().toISOString();
  const out = await service.commit(
    {
      user_id: userId,
      opened_at: b.opened_at,
      closed_at: closedAt,
      notas: b.notas ?? null,
      signature_url: b.signature_url ?? null,
    },
    req.user.id,
  );
  ok(res, out, 201);
}

export async function list(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const q = listQuery.parse(req.query);
  const filters: { user_id?: number; limit?: number } = {};
  if (q.limit !== undefined) filters.limit = q.limit;
  if (req.user.role === 'recepcion') {
    filters.user_id = req.user.id;
  } else if (q.user_id) {
    filters.user_id = q.user_id;
  }
  ok(res, await service.list(filters));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const r = await service.getById(id);
  if (!r) throw Errors.notFound('Cierre no encontrado');
  ok(res, r);
}

export async function lastForUser(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  ok(res, { last_closed_at: await service.lastClosure(req.user.id) });
}
