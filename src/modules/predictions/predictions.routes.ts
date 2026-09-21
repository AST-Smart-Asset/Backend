import { Router } from 'express';
import { evaluateAssetRiskEndpoint, getModelCard } from './predictions.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);
router.post('/evaluate/:assetId', evaluateAssetRiskEndpoint);
router.get('/model-card', getModelCard);

export default router;
