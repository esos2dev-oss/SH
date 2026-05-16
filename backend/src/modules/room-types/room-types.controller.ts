import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import {
  createRoomTypeSchema,
  updateRoomTypeSchema,
  listRoomTypesQuerySchema,
} from './room-types.validation.js';
import * as service from './room-types.service.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function list(req: Request, res: Response): Promise<void> {
  const query = listRoomTypesQuerySchema.parse(req.query);
  const items = await service.list(query);
  ok(res, items);
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  ok(res, await service.getById(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const input = createRoomTypeSchema.parse(req.body);
  const item = await service.create(input, req.user.id);
  ok(res, item, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  const input = updateRoomTypeSchema.parse(req.body);
  ok(res, await service.update(id, input, req.user.id));
}

export async function softDelete(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  await service.softDelete(id, req.user.id);
  ok(res, { message: 'Tipo de habitacion desactivado' });
}
