// Controllers HTTP del modulo payments.

import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, paginated, buildPagination } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import {
  createPaymentSchema,
  updatePaymentSchema,
  rejectPaymentSchema,
  listPaymentsQuerySchema,
  lookupQuerySchema,
  exchangeRateUpsertSchema,
} from './payments.validation.js';
import * as service from './payments.service.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function list(req: Request, res: Response): Promise<void> {
  const query = listPaymentsQuerySchema.parse(req.query);
  const { items, total } = await service.list(query);
  paginated(res, items, buildPagination(total, query.page, query.limit));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  ok(res, await service.getById(id));
}

export async function lookup(req: Request, res: Response): Promise<void> {
  const q = lookupQuerySchema.parse(req.query);
  ok(res, await service.quickLookup(q));
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const input = createPaymentSchema.parse(req.body);
  const out = await service.create(input, req.user.id, req.user.role);
  ok(res, out, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  const input = updatePaymentSchema.parse(req.body);
  ok(res, await service.update(id, input, req.user.id));
}

export async function confirm(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  ok(res, await service.confirm(id, req.user.id));
}

export async function reject(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  const input = rejectPaymentSchema.parse(req.body);
  ok(res, await service.reject(id, input.reason, req.user.id));
}

export async function customerStatement(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  ok(res, await service.customerStatement(id));
}

export async function bookingStatement(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  ok(res, await service.bookingStatement(id));
}

// -------- Exchange rates --------

export async function ratesCurrent(_req: Request, res: Response): Promise<void> {
  ok(res, await service.getCurrentRate());
}

export async function ratesList(_req: Request, res: Response): Promise<void> {
  ok(res, await service.listRates(30));
}

export async function ratesUpsert(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const input = exchangeRateUpsertSchema.parse(req.body);
  ok(res, await service.upsertRate(input, req.user.id), 201);
}
