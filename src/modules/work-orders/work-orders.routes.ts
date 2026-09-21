import { Router } from 'express';
import { listWorkOrders, createWorkOrder, closeWorkOrder } from './work-orders.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

router.use(authMiddleware);
router.get('/', listWorkOrders);
router.post('/', requireRole(['super_admin', 'asset_admin', 'technician']), createWorkOrder);
router.post('/:id/close', requireRole(['super_admin', 'asset_admin', 'technician']), closeWorkOrder);

export default router;
