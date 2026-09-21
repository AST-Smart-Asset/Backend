import { Router } from 'express';
import { createSession, recordScan, getSessionReport } from './stocktake.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

router.use(authMiddleware);
router.post('/sessions', requireRole(['super_admin', 'asset_admin', 'auditor']), createSession);
router.post('/sessions/:sessionId/scan', requireRole(['super_admin', 'asset_admin', 'auditor']), recordScan);
router.get('/sessions/:sessionId/report', requireRole(['super_admin', 'asset_admin', 'auditor']), getSessionReport);

export default router;
