// Controllers HTTP del sub-modulo de conciliacion bancaria.

import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import * as service from './bank-reconciliation.service.js';
import type { BankKey } from './bank-reconciliation.parsers.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

const BANK_KEYS = ['banesco', 'mercantil', 'venezuela', 'provincial', 'generic'] as const;

const uploadBody = z.object({
  banco: z.enum(BANK_KEYS),
  cuenta: z.string().trim().max(50).optional().nullable(),
  moneda: z.string().trim().length(3).default('VES'),
});

const matchBody = z.object({
  payment_id: z.coerce.number().int().positive().optional().nullable(),
});

interface FileRequest extends Request { file?: Express.Multer.File }

export async function upload(req: FileRequest, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  if (!req.file) throw Errors.validation('Archivo requerido (campo "file")');
  const meta = uploadBody.parse(req.body);
  const out = await service.uploadStatement(
    {
      banco: meta.banco as BankKey,
      cuenta: meta.cuenta ?? null,
      moneda: meta.moneda,
      filename: req.file.originalname,
      fileBuffer: req.file.buffer,
    },
    req.user.id,
  );
  ok(res, out, 201);
}

export async function listStatements(_req: Request, res: Response): Promise<void> {
  ok(res, await service.listStatements());
}

export async function listMovements(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const unmatched = req.query['unmatched'] === 'true';
  ok(res, await service.listMovements(id, unmatched));
}

export async function suggestMatches(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  ok(res, await service.suggestMatches(id));
}

export async function matchMovement(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  const { payment_id } = matchBody.parse(req.body);
  await service.manualMatch(id, payment_id ?? null, req.user.id);
  ok(res, { ok: true });
}

export async function autoConfirm(req: Request, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  ok(res, await service.autoConfirmExactMatches(id, req.user.id));
}
