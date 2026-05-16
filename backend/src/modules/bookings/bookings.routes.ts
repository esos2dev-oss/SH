import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import * as ctrl from './bookings.controller.js';

const router = Router();
router.use(verifyToken);

router.get('/', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.list));
router.get('/calendar', roleGuard(['superadmin', 'admin', 'recepcion']), asyncHandler(ctrl.calendar));
router.get('/availability', asyncHandler(ctrl.availability));
router.get('/:id', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.getOne));
router.get('/:id/payments', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.listPayments));

router.post('/', roleGuard(['superadmin', 'admin', 'recepcion']), asyncHandler(ctrl.create));
router.patch('/:id', roleGuard(['superadmin', 'admin', 'recepcion']), asyncHandler(ctrl.update));
router.post('/:id/move', roleGuard(['superadmin', 'admin', 'recepcion']), asyncHandler(ctrl.move));
router.post('/:id/confirm', roleGuard(['superadmin', 'admin', 'recepcion']), asyncHandler(ctrl.confirm));
router.post('/:id/cancel', roleGuard(['superadmin', 'admin', 'recepcion']), asyncHandler(ctrl.cancel));
router.post('/:id/no-show', roleGuard(['superadmin', 'admin', 'recepcion']), asyncHandler(ctrl.noShow));
router.post('/:id/payments', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.addPayment));

export default router;
