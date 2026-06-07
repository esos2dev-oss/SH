import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import * as ctrl from './customers.controller.js';

const router = Router();
router.use(verifyToken);

router.get('/', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.list));
router.get('/:id', roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']), asyncHandler(ctrl.getOne));
router.get('/:id/timeline', roleGuard(['superadmin', 'admin', 'recepcion']), asyncHandler(ctrl.timeline));

router.post('/', roleGuard(['superadmin', 'admin', 'recepcion']), asyncHandler(ctrl.create));
router.patch('/:id', roleGuard(['superadmin', 'admin', 'recepcion']), asyncHandler(ctrl.update));
router.delete('/:id', roleGuard(['superadmin']), asyncHandler(ctrl.softDelete));

export default router;
