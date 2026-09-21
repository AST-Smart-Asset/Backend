import { Router } from 'express';
import { transferAsset, checkOutAsset, checkInAsset, getAssetHistory } from './custody.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

router.use(authMiddleware);

router.post('/:assetId/transfer', requireRole(['super_admin', 'asset_admin', 'custodian_manager']), transferAsset);
router.post('/:assetId/check-out', requireRole(['super_admin', 'asset_admin', 'custodian_manager']), checkOutAsset);
router.post('/:assetId/check-in', requireRole(['super_admin', 'asset_admin', 'custodian_manager']), checkInAsset);
router.get('/:assetId/history', getAssetHistory);

export default router;
