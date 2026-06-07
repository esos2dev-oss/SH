import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, paginated, buildPagination } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
} from './customers.validation.js';
import * as service from './customers.service.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function list(req: Request, res: Response): Promise<void> {
  const query = listCustomersQuerySchema.parse(req.query);
  const { items, total } = await service.list(query);
  paginated(res, items, buildPagination(total, query.page, query.limit));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  ok(res, await service.getById(id));
}

export async function timeline(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  ok(res, await service.timeline(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  ok(res, await service.create(createCustomerSchema.parse(req.body), req.user.id), 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  ok(res, await service.update(id, updateCustomerSchema.parse(req.body), req.user.id));
}

export async function softDelete(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  await service.softDelete(id, req.user.id);
  ok(res, { message: 'Huesped desactivado' });
}
