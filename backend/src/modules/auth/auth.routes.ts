// Rutas del modulo auth.

import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { loginLimiter } from '../../shared/middleware/rate-limit.js';
import * as authCtrl from './auth.controller.js';

const router = Router();

router.post('/login', loginLimiter, asyncHandler(authCtrl.login));
router.post('/refresh', asyncHandler(authCtrl.refresh));
router.post('/logout', asyncHandler(authCtrl.logout));
router.post('/set-password', asyncHandler(authCtrl.setPassword));
router.post('/forgot-password', asyncHandler(authCtrl.forgotPassword));
router.post('/change-password', verifyToken, asyncHandler(authCtrl.changePassword));
router.get('/me', verifyToken, asyncHandler(authCtrl.me));

export default router;
