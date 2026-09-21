import { Router } from 'express';
import { listTemplates, createTemplate } from './maintenance.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

router.use(authMiddleware);
router.get('/', listTemplates);
router.post('/', requireRole(['super_admin', 'asset_admin']), createTemplate);

export default router;
