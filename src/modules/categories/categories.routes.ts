import { Router } from 'express';
import { listCategories, createCategory } from './categories.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

router.use(authMiddleware);
router.get('/', listCategories);
router.post('/', requireRole(['super_admin', 'asset_admin']), createCategory);

export default router;
