import { Router } from 'express';
import { getDashboardKPIs } from './dashboard.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);
router.get('/kpis', getDashboardKPIs);

export default router;
