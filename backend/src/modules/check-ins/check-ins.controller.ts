import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import { createCheckInSchema, checkOutSchema } from './check-ins.validation.js';
import * as service from './check-ins.service.js';

const bookingIdParam = z.object({ bookingId: z.coerce.number().int().positive() });

export async function getByBooking(req: Request, res: Response): Promise<void> {
  const { bookingId } = bookingIdParam.parse(req.params);
  ok(res, await service.getByBookingId(bookingId));
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  // Multer pone files en req.files (campo array). Si vienen como objects, parsear.
  const files = req.files as
    | { documento?: Express.Multer.File[]; firma?: Express.Multer.File[] }
    | undefined;
  const documento = files?.documento?.[0];
  const firma = files?.firma?.[0];

  // El body en multipart viene como strings. Reparsear arrays JSON si vienen.
  const body = { ...req.body };
  if (typeof body.huespedes_acompaniantes === 'string') {
    try { body.huespedes_acompaniantes = JSON.parse(body.huespedes_acompaniantes); }
    catch { body.huespedes_acompaniantes = []; }
  }

  const input = createCheckInSchema.parse(body);
  ok(res, await service.checkIn(input, documento, firma, req.user.id), 201);
}

export async function checkout(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { bookingId } = bookingIdParam.parse(req.params);
  ok(res, await service.checkOut(bookingId, checkOutSchema.parse(req.body), req.user.id));
}

export async function documentoUrl(req: Request, res: Response): Promise<void> {
  const { bookingId } = bookingIdParam.parse(req.params);
  ok(res, await service.getDocumentoUrl(bookingId));
}
