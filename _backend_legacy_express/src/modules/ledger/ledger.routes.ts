import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import * as ctrl from './ledger.controller.js';

const router = Router();
router.use(verifyToken);
router.use(roleGuard(['superadmin', 'admin', 'contabilidad']));

router.get('/', asyncHandler(ctrl.list));
router.get('/summary', asyncHandler(ctrl.summary));
router.get('/:id', asyncHandler(ctrl.getOne));
router.post('/', asyncHandler(ctrl.create));
router.post('/:id/conciliar', asyncHandler(ctrl.conciliar));

export default router;
