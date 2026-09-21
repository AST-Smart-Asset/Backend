import { Router } from 'express';
import { listAssets, getAssetById, createAsset, batchImportAssets } from './assets.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

router.use(authMiddleware);
router.get('/', listAssets);
router.get('/:id', getAssetById);
router.post('/', requireRole(['super_admin', 'asset_admin']), createAsset);
router.post('/import', requireRole(['super_admin', 'asset_admin']), batchImportAssets);

export default router;
