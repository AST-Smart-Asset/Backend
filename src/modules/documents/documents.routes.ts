import { Router } from 'express';
import {
  uploadDocument,
  getAssetDocuments,
  getDocumentDownloadToken,
  streamDocument,
} from './documents.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

// Publicly accessible with valid short-lived cryptographic token
router.get('/download', streamDocument);

// Protected routes
router.use(authMiddleware);
router.post('/', requireRole(['super_admin', 'asset_admin', 'procurement_finance']), uploadDocument);
router.get('/asset/:assetId', requireRole(['super_admin', 'asset_admin', 'procurement_finance', 'auditor']), getAssetDocuments);
router.get('/:id/download-token', requireRole(['super_admin', 'asset_admin', 'procurement_finance', 'auditor']), getDocumentDownloadToken);

export default router;
