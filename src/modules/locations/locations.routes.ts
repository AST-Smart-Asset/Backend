import { Router } from 'express';
import { listLocations, getLocationById, createLocation } from './locations.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

router.use(authMiddleware);
router.get('/', listLocations);
router.get('/:id', getLocationById);
router.post('/', requireRole(['super_admin', 'asset_admin']), createLocation);

export default router;
