// Modulo receipts: subida de comprobantes a R2 vinculados a ledger_entries.

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../shared/config/db.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import { uploadReceipt } from '../../shared/middleware/upload.js';
import { logAudit } from '../../shared/services/audit.service.js';
import { uploadObject, buildKey, getPresignedGetUrl, deleteObject } from '../../shared/services/r2.service.js';
import { r2Configured } from '../../shared/config/r2.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const createBodySchema = z.object({
  ledger_entry_id: z.coerce.number().int().positive(),
});

interface ReceiptRow {
  id: number;
  ledger_entry_id: number;
  file_url: string;
  kind: 'imagen' | 'pdf';
  mime_type: string;
  size_bytes: string;
  original_name: string;
  uploaded_by: number;
  active: boolean;
  created_at: Date;
}

const router = Router();
router.use(verifyToken);
router.use(roleGuard(['superadmin', 'admin', 'contabilidad']));

// Listar receipts de un ledger_entry
router.get('/by-entry/:id', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { rows } = await pool.query<ReceiptRow>(
    `SELECT * FROM receipts WHERE ledger_entry_id = $1 AND active = true ORDER BY created_at DESC`,
    [id],
  );
  ok(res, rows.map((r) => ({
    id: r.id,
    ledger_entry_id: r.ledger_entry_id,
    kind: r.kind,
    mime_type: r.mime_type,
    size_bytes: Number(r.size_bytes),
    original_name: r.original_name,
    uploaded_by: r.uploaded_by,
    created_at: r.created_at.toISOString(),
  })));
}));

router.post('/', uploadReceipt.single('file'), asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  if (!r2Configured) throw Errors.internal('Storage R2 no esta configurado');
  if (!req.file) throw Errors.validation('Archivo requerido en campo "file"');
  const { ledger_entry_id } = createBodySchema.parse(req.body);

  // Verificar que el ledger_entry existe
  const { rows: entryRows } = await pool.query(`SELECT id FROM ledger_entries WHERE id = $1`, [ledger_entry_id]);
  if (!entryRows.length) throw Errors.notFound('Asiento no encontrado');

  const kind: 'imagen' | 'pdf' = req.file.mimetype === 'application/pdf' ? 'pdf' : 'imagen';
  const key = buildKey(`receipts/${ledger_entry_id}`, req.file.originalname);
  await uploadObject({ key, buffer: req.file.buffer, contentType: req.file.mimetype });

  const { rows } = await pool.query<ReceiptRow>(
    `INSERT INTO receipts (ledger_entry_id, file_url, kind, mime_type, size_bytes, original_name, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [ledger_entry_id, key, kind, req.file.mimetype, req.file.size, req.file.originalname, req.user.id],
  );
  const created = rows[0]!;
  await logAudit({
    userId: req.user.id,
    action: 'create',
    entity: 'receipts',
    entityId: created.id,
    after: { ledger_entry_id, kind, size_bytes: req.file.size },
  });
  ok(res, {
    id: created.id,
    ledger_entry_id: created.ledger_entry_id,
    kind: created.kind,
    mime_type: created.mime_type,
    size_bytes: Number(created.size_bytes),
    original_name: created.original_name,
    created_at: created.created_at.toISOString(),
  }, 201);
}));

router.get('/:id/url', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { rows } = await pool.query<ReceiptRow>(`SELECT * FROM receipts WHERE id = $1 AND active = true`, [id]);
  if (!rows.length) throw Errors.notFound('Comprobante no encontrado');
  const url = await getPresignedGetUrl(rows[0]!.file_url, 900);
  ok(res, { url, expires_in: 900 });
}));

router.delete('/:id', roleGuard(['superadmin', 'admin']), asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const { id } = idParam.parse(req.params);
  const { rows } = await pool.query<ReceiptRow>(`SELECT * FROM receipts WHERE id = $1 AND active = true`, [id]);
  if (!rows.length) throw Errors.notFound();
  // Soft delete
  await pool.query(`UPDATE receipts SET active = false WHERE id = $1`, [id]);
  // Hard delete del objeto en R2 (best-effort)
  try { await deleteObject(rows[0]!.file_url); } catch { /* ignore */ }
  await logAudit({ userId: req.user.id, action: 'delete', entity: 'receipts', entityId: id });
  ok(res, { message: 'Comprobante eliminado' });
}));

export default { prefix: '/api/receipts', router };
