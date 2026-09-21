import { Router } from 'express';
import { listAuditLogs, listAllAssetEvents } from './audit.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

router.use(authMiddleware);
router.get('/logs', requireRole(['super_admin', 'auditor']), listAuditLogs);
router.get('/events', requireRole(['super_admin', 'auditor', 'asset_admin']), listAllAssetEvents);

export default router;
