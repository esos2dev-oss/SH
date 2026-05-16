// Upload de comprobantes/capturas para pagos. Usa storage.service.

import type { Request, Response } from 'express';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import { putObject } from '../../shared/services/storage.service.js';
import { logAudit } from '../../shared/services/audit.service.js';

interface FileRequest extends Request { file?: Express.Multer.File }

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

export async function uploadReceipt(req: FileRequest, res: Response): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const file = req.file;
  if (!file) throw Errors.validation('Archivo requerido (campo "file")');
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw Errors.validation(`Tipo no permitido: ${file.mimetype}. Usa JPG, PNG, WEBP, GIF o PDF.`);
  }
  if (file.size > 5 * 1024 * 1024) {
    throw Errors.validation('Archivo muy grande (max 5 MB)');
  }

  const stored = await putObject({
    folder: 'receipts',
    buffer: file.buffer,
    contentType: file.mimetype,
    originalName: file.originalname,
  });

  await logAudit({
    userId: req.user.id,
    action: 'create',
    entity: 'payment_receipts',
    after: { storageKey: stored.storageKey, mime: file.mimetype, size: file.size },
  });

  ok(res, { url: stored.url, mime: file.mimetype, size: file.size, filename: file.originalname });
}
