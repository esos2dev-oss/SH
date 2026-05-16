import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import * as ctrl from './room-types.controller.js';

const router = Router();
router.use(verifyToken);

router.get('/', asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.getOne));
router.post('/', roleGuard(['superadmin', 'admin']), asyncHandler(ctrl.create));
router.patch('/:id', roleGuard(['superadmin', 'admin']), asyncHandler(ctrl.update));
router.delete('/:id', roleGuard(['superadmin', 'admin']), asyncHandler(ctrl.softDelete));

export default router;
