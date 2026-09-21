import { Router } from 'express';
import { login, refreshTokens, getProfile } from './auth.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();

router.post('/login', login);
router.post('/refresh', refreshTokens);
router.get('/me', authMiddleware, getProfile);

export default router;
