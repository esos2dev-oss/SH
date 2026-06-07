import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import { uploadDocument } from '../../shared/middleware/upload.js';
import * as ctrl from './check-ins.controller.js';

const router = Router();
router.use(verifyToken);

router.get(
  '/:bookingId',
  roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']),
  asyncHandler(ctrl.getByBooking),
);
router.get(
  '/:bookingId/documento',
  roleGuard(['superadmin', 'admin', 'recepcion']),
  asyncHandler(ctrl.documentoUrl),
);

router.post(
  '/',
  roleGuard(['superadmin', 'admin', 'recepcion']),
  uploadDocument.fields([
    { name: 'documento', maxCount: 1 },
    { name: 'firma', maxCount: 1 },
  ]),
  asyncHandler(ctrl.create),
);

router.post(
  '/:bookingId/checkout',
  roleGuard(['superadmin', 'admin', 'recepcion']),
  asyncHandler(ctrl.checkout),
);

export default router;
