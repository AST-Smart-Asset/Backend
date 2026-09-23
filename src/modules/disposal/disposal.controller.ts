import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { logAudit, getRequestClientInfo } from '../../middleware/audit.middleware';

const retireAssetSchema = z.object({
  disposalMethod: z.enum(['decommissioned', 'salvaged', 'donated', 'recycled', 'scrapped']),
  reason: z.string().min(10, 'A detailed retirement reason is required'),
  approvalNotes: z.string().min(5, 'Approval justification is required'),
  evidenceDocumentId: z.string().uuid().optional().nullable(),
});

/**
 * AST-FR-10 Controlled asset retirement & disposal
 */
export async function retireAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
   const { assetId } = req.params;

if (!assetId) {
  throw new AppError('Asset ID is required', 400, 'INVALID_ASSET_ID');
}

const data = retireAssetSchema.parse(req.body);
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: { currentLocation: true },
    });

    if (!asset) throw new AppError('Asset record not found', 404, 'NOT_FOUND');
    if (asset.status === 'retired' || asset.status === 'disposed') {
      throw new AppError('Asset has already been retired or disposed', 400, 'ALREADY_RETIRED');
    }

    if (data.evidenceDocumentId) {
      const doc = await prisma.assetDocument.findUnique({ where: { id: data.evidenceDocumentId } });
      if (!doc || doc.assetId !== assetId) {
        throw new AppError('Invalid evidence document linked to asset', 400, 'INVALID_EVIDENCE');
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Transition asset status to retired and clear custodian
      const updated = await tx.asset.update({
        where: { id: assetId },
        data: {
          status: 'retired',
          custodianUserId: null,
          updatedBy: req.user?.id,
        },
      });

      // Write immutable disposal event
      await tx.assetEvent.create({
        data: {
          assetId,
          actorUserId: req.user?.id,
          fromLocationId: asset.currentLocationId,
          eventType: 'disposed',
          eventData: {
            disposalMethod: data.disposalMethod,
            reason: data.reason,
            approvalNotes: data.approvalNotes,
            evidenceDocumentId: data.evidenceDocumentId || null,
            approvedBy: req.user?.email,
            timestamp: new Date().toISOString(),
          },
        },
      });

      return updated;
    });

    const clientInfo = getRequestClientInfo(req);
    await logAudit({
      action: 'APPROVE',
      tableName: 'assets',
      recordId: assetId,
      actorUserId: req.user?.id,
      metadata: {
        action: 'retire_asset',
        disposalMethod: data.disposalMethod,
        reason: data.reason,
      },
      ...clientInfo,
    });

    sendSuccess(res, {
      message: 'Asset successfully retired and sealed as read-only record in audit reports',
      asset: result,
    });
  } catch (err) {
    next(err);
  }
}
