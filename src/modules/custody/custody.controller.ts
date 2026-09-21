import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { logAudit, getRequestClientInfo } from '../../middleware/audit.middleware';

const transferSchema = z.object({
  targetLocationId: z.string().uuid(),
  targetCustodianId: z.string().uuid().optional().nullable(),
  reason: z.string().min(3),
  approvalNotes: z.string().optional().nullable(),
});

const checkOutSchema = z.object({
  custodianUserId: z.string().uuid(),
  purpose: z.string().min(3),
  expectedReturnDate: z.string().datetime().optional().nullable(),
});

const checkInSchema = z.object({
  returnLocationId: z.string().uuid(),
  condition: z.enum(['excellent', 'good', 'fair', 'poor', 'damaged']).default('good'),
  notes: z.string().optional().nullable(),
});

/**
 * AST-FR-04 Transfer Asset between locations and custodians
 */
export async function transferAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assetId } = req.params;
    const { targetLocationId, targetCustodianId, reason, approvalNotes } = transferSchema.parse(req.body);

    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: { currentLocation: true, custodian: true },
    });

    if (!asset) {
      throw new AppError('Asset record not found', 404, 'NOT_FOUND');
    }

    if (asset.status === 'retired' || asset.status === 'disposed') {
      throw new AppError('Cannot transfer a retired or disposed asset', 400, 'ASSET_READ_ONLY');
    }

    const targetLocation = await prisma.location.findUnique({ where: { id: targetLocationId } });
    if (!targetLocation) {
      throw new AppError('Target location not found', 400, 'INVALID_LOCATION');
    }

    if (targetCustodianId) {
      const custodian = await prisma.user.findUnique({ where: { id: targetCustodianId } });
      if (!custodian) {
        throw new AppError('Target custodian not found', 400, 'INVALID_CUSTODIAN');
      }
    }

    // Execute atomic transfer and append-only event record in database transaction
    const result = await prisma.$transaction(async (tx) => {
      const fromLocationId = asset.currentLocationId;
      const fromCustodianId = asset.custodianUserId;

      const updated = await tx.asset.update({
        where: { id: assetId },
        data: {
          currentLocationId: targetLocationId,
          custodianUserId: targetCustodianId !== undefined ? targetCustodianId : asset.custodianUserId,
          status: 'transferred',
          updatedBy: req.user?.id,
        },
        include: {
          currentLocation: true,
          custodian: { select: { id: true, fullName: true, email: true } },
        },
      });

      const event = await tx.assetEvent.create({
        data: {
          assetId,
          actorUserId: req.user?.id,
          fromLocationId,
          toLocationId: targetLocationId,
          fromCustodianId,
          toCustodianId: targetCustodianId !== undefined ? targetCustodianId : asset.custodianUserId,
          eventType: 'transferred',
          eventData: {
            reason,
            approvalNotes,
            fromLocationCode: asset.currentLocation.code,
            toLocationCode: targetLocation.code,
            timestamp: new Date().toISOString(),
          },
        },
      });

      return { updated, event };
    });

    const clientInfo = getRequestClientInfo(req);
    await logAudit({
      action: 'UPDATE',
      tableName: 'assets',
      recordId: assetId,
      actorUserId: req.user?.id,
      metadata: {
        action: 'transfer',
        fromLocation: asset.currentLocationId,
        toLocation: targetLocationId,
      },
      ...clientInfo,
    });

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * Check out asset to a named custodian
 */
export async function checkOutAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assetId } = req.params;
    const { custodianUserId, purpose, expectedReturnDate } = checkOutSchema.parse(req.body);

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new AppError('Asset not found', 404, 'NOT_FOUND');
    if (asset.status === 'retired' || asset.status === 'disposed') {
      throw new AppError('Cannot check out a retired or disposed asset', 400, 'ASSET_READ_ONLY');
    }

    const custodian = await prisma.user.findUnique({ where: { id: custodianUserId } });
    if (!custodian) throw new AppError('Custodian user not found', 400, 'INVALID_CUSTODIAN');

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.asset.update({
        where: { id: assetId },
        data: {
          custodianUserId,
          status: 'in_service',
          updatedBy: req.user?.id,
        },
      });

      await tx.assetEvent.create({
        data: {
          assetId,
          actorUserId: req.user?.id,
          fromCustodianId: asset.custodianUserId,
          toCustodianId: custodianUserId,
          toLocationId: asset.currentLocationId,
          eventType: 'checked_out',
          eventData: { purpose, expectedReturnDate },
        },
      });

      return updated;
    });

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * Check in asset back into storage
 */
export async function checkInAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assetId } = req.params;
    const { returnLocationId, condition, notes } = checkInSchema.parse(req.body);

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new AppError('Asset not found', 404, 'NOT_FOUND');

    const result = await prisma.$transaction(async (tx) => {
      const fromCustodianId = asset.custodianUserId;

      const updated = await tx.asset.update({
        where: { id: assetId },
        data: {
          currentLocationId: returnLocationId,
          custodianUserId: null,
          condition,
          status: 'in_storage',
          updatedBy: req.user?.id,
        },
      });

      await tx.assetEvent.create({
        data: {
          assetId,
          actorUserId: req.user?.id,
          fromLocationId: asset.currentLocationId,
          toLocationId: returnLocationId,
          fromCustodianId,
          toCustodianId: null,
          eventType: 'checked_in',
          eventData: { condition, notes },
        },
      });

      return updated;
    });

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * Get immutable event trail of movements and state changes
 */
export async function getAssetHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assetId } = req.params;
    const events = await prisma.assetEvent.findMany({
      where: { assetId },
      include: {
        actor: { select: { id: true, fullName: true, email: true } },
        fromLocation: true,
        toLocation: true,
        fromCustodian: { select: { id: true, fullName: true } },
        toCustodian: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    sendSuccess(res, events);
  } catch (err) {
    next(err);
  }
}
