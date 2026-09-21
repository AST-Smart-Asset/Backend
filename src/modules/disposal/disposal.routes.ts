import { Router } from 'express';
import { retireAsset } from './disposal.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

router.use(authMiddleware);
router.post('/:assetId/retire', requireRole(['super_admin', 'asset_admin']), retireAsset);

export default router;
