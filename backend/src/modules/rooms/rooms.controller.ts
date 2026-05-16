import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import {
  createRoomSchema,
  updateRoomSchema,
  updateStatusSchema,
  listRoomsQuerySchema,
} from './rooms.validation.js';
import * as service from './rooms.service.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function list(req: Request, res: Response): Promise<void> {
  const query = listRoomsQuerySchema.parse(req.query);
  ok(res, await service.list(query));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  ok(res, await service.getById(id));
}

export async function occupancy(_req: Request, res: Response): Promise<void> {
  ok(res, await service.getOccupancy());
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const input = createRoomSchema.parse(req.body);
  ok(res, await service.create(input, req.user.id), 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  ok(res, await service.update(id, updateRoomSchema.parse(req.body), req.user.id));
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  ok(res, await service.updateStatus(id, updateStatusSchema.parse(req.body), req.user));
}

export async function softDelete(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  await service.softDelete(id, req.user.id);
  ok(res, { message: 'Habitacion desactivada' });
}
