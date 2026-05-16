import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import * as ctrl from './users.controller.js';

const router = Router();

// Todas requieren auth
router.use(verifyToken);

router.get('/', roleGuard(['superadmin', 'admin']), asyncHandler(ctrl.list));
router.post('/', roleGuard(['superadmin']), asyncHandler(ctrl.create));
router.get('/:id', roleGuard(['superadmin', 'admin']), asyncHandler(ctrl.getOne));
router.patch('/:id', roleGuard(['superadmin']), asyncHandler(ctrl.update));
router.delete('/:id', roleGuard(['superadmin']), asyncHandler(ctrl.softDelete));
router.post('/:id/resend-invite', roleGuard(['superadmin']), asyncHandler(ctrl.resendInvite));

export default router;
