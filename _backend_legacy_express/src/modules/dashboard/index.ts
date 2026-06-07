// Modulo dashboard: agrega informacion de varios dominios para la home.

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { ok } from '../../shared/utils/response.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import * as service from './dashboard.service.js';

const todayQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const router = Router();
router.use(verifyToken);

router.get(
  '/today',
  roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']),
  asyncHandler(async (req, res) => {
    const q = todayQuery.parse(req.query);
    ok(res, await service.getToday(q.date));
  }),
);

export default { prefix: '/api/dashboard', router };
