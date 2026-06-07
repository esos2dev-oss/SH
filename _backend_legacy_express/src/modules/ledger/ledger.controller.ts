import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, paginated, buildPagination } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import { createLedgerSchema, listLedgerQuerySchema, summaryQuerySchema } from './ledger.validation.js';
import * as service from './ledger.service.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function list(req: Request, res: Response): Promise<void> {
  const query = listLedgerQuerySchema.parse(req.query);
  const { items, total } = await service.list(query);
  paginated(res, items, buildPagination(total, query.page, query.limit));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  ok(res, await service.getById(id));
}

export async function summary(req: Request, res: Response): Promise<void> {
  ok(res, await service.summary(summaryQuerySchema.parse(req.query)));
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  ok(res, await service.create(createLedgerSchema.parse(req.body), req.user.id), 201);
}

export async function conciliar(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  ok(res, await service.conciliar(id, req.user.id));
}
