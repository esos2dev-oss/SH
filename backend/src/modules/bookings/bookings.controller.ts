import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, paginated, buildPagination } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import {
  createBookingSchema,
  updateBookingSchema,
  cancelSchema,
  listBookingsQuerySchema,
  calendarQuerySchema,
  availabilityQuerySchema,
  createPaymentSchema,
} from './bookings.validation.js';
import * as service from './bookings.service.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function list(req: Request, res: Response): Promise<void> {
  const query = listBookingsQuerySchema.parse(req.query);
  const { items, total } = await service.list(query);
  paginated(res, items, buildPagination(total, query.page, query.limit));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  ok(res, await service.getById(id));
}

export async function calendar(req: Request, res: Response): Promise<void> {
  ok(res, await service.calendar(calendarQuerySchema.parse(req.query)));
}

export async function availability(req: Request, res: Response): Promise<void> {
  ok(res, await service.availability(availabilityQuerySchema.parse(req.query)));
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  ok(res, await service.create(createBookingSchema.parse(req.body), req.user.id), 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  ok(res, await service.update(id, updateBookingSchema.parse(req.body), req.user.id));
}

export async function confirm(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  ok(res, await service.transition(id, 'confirmada', req.user.id));
}

export async function cancel(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  ok(res, await service.cancel(id, cancelSchema.parse(req.body), req.user.id));
}

export async function noShow(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  ok(res, await service.transition(id, 'no_show', req.user.id));
}

export async function listPayments(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  ok(res, await service.listPayments(id));
}

export async function addPayment(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  ok(res, await service.addPayment(id, createPaymentSchema.parse(req.body), req.user.id), 201);
}
