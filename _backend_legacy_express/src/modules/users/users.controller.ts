import type { Request, Response } from 'express';
import { z } from 'zod';

import { ok, paginated, buildPagination } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';

import {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
} from './users.validation.js';
import * as usersService from './users.service.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function list(req: Request, res: Response): Promise<void> {
  const query = listUsersQuerySchema.parse(req.query);
  const { items, total } = await usersService.list(query);
  paginated(res, items, buildPagination(total, query.page, query.limit));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const u = await usersService.getById(id);
  ok(res, u);
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const input = createUserSchema.parse(req.body);
  const result = await usersService.createUser(input, req.user.id);
  ok(res, { user: result.user, message: 'Usuario creado. Email de invitacion enviado.' }, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  const input = updateUserSchema.parse(req.body);
  const u = await usersService.updateUser(id, input, req.user.id);
  ok(res, u);
}

export async function softDelete(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  if (id === req.user.id) {
    throw Errors.validation('No puedes desactivar tu propia cuenta');
  }
  await usersService.softDelete(id, req.user.id);
  ok(res, { message: 'Usuario desactivado' });
}

export async function resendInvite(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  await usersService.resendInvite(id, req.user.id);
  ok(res, { message: 'Invitacion reenviada' });
}
