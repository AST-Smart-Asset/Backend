import { Router } from 'express';
import { listOrgUnits, createOrgUnit } from './org-units.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

router.use(authMiddleware);
router.get('/', listOrgUnits);
router.post('/', requireRole(['super_admin']), createOrgUnit);

export default router;
