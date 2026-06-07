// Rutas REST del modulo payments.

import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import { Errors } from '../../shared/utils/app-error.js';
import * as ctrl from './payments.controller.js';
import * as bankCtrl from './bank-reconciliation.controller.js';
import * as cashCtrl from './cash-closure.controller.js';
import * as receiptsCtrl from './receipts.controller.js';

const router = Router();
router.use(verifyToken);

const ALLOWED_STATEMENT_MIME = new Set([
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

const uploadStatementFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const lower = file.originalname.toLowerCase();
    if (!ALLOWED_STATEMENT_MIME.has(file.mimetype) && !lower.endsWith('.csv') && !lower.endsWith('.txt')) {
      cb(Errors.validation(`Tipo de archivo no permitido (${file.mimetype}). Use CSV o TXT.`));
      return;
    }
    cb(null, true);
  },
});

// Lookup rapido para autocompletado del modal (P)
router.get('/lookup', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.lookup));

// Upload de comprobantes/capturas
const uploadReceiptFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
router.post(
  '/upload-receipt',
  roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']),
  uploadReceiptFile.single('file'),
  asyncHandler(receiptsCtrl.uploadReceipt),
);

// Conciliacion bancaria — solo admin/contabilidad
router.post(
  '/bank-statements/upload',
  roleGuard(['superadmin', 'admin', 'contabilidad']),
  uploadStatementFile.single('file'),
  asyncHandler(bankCtrl.upload),
);
router.get('/bank-statements', roleGuard(['superadmin', 'admin', 'contabilidad']), asyncHandler(bankCtrl.listStatements));
router.get('/bank-statements/:id/movements', roleGuard(['superadmin', 'admin', 'contabilidad']), asyncHandler(bankCtrl.listMovements));
router.post('/bank-statements/:id/auto-confirm', roleGuard(['superadmin', 'admin', 'contabilidad']), asyncHandler(bankCtrl.autoConfirm));
router.get('/bank-movements/:id/suggestions', roleGuard(['superadmin', 'admin', 'contabilidad']), asyncHandler(bankCtrl.suggestMatches));
router.post('/bank-movements/:id/match', roleGuard(['superadmin', 'admin', 'contabilidad']), asyncHandler(bankCtrl.matchMovement));

// Cierre de caja por turno
router.get('/cash-closures/preview', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(cashCtrl.preview));
router.get('/cash-closures/last', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(cashCtrl.lastForUser));
router.get('/cash-closures', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(cashCtrl.list));
router.get('/cash-closures/:id', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(cashCtrl.getOne));
router.post('/cash-closures', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(cashCtrl.close));

// Tasas BCV — todos pueden leer la actual; escribir solo admin/superadmin
router.get('/rates/current', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.ratesCurrent));
router.get('/rates', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.ratesList));
router.post('/rates', roleGuard(['superadmin', 'admin']), asyncHandler(ctrl.ratesUpsert));

// Estados de cuenta
router.get('/customer/:id/statement', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.customerStatement));
router.get('/booking/:id/statement', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.bookingStatement));

// CRUD de pagos
router.get('/', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.list));
router.get('/:id', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.getOne));

router.post('/', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.create));
router.patch('/:id', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.update));
router.post('/:id/confirm', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.confirm));
router.post('/:id/reject', roleGuard(['superadmin', 'admin', 'contabilidad']), asyncHandler(ctrl.reject));

export default router;
