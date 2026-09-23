import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { logAudit, getRequestClientInfo } from '../../middleware/audit.middleware';

const createSessionSchema = z.object({
  locationId: z.string().uuid(),
  title: z.string().min(3),
});

const scanObservationSchema = z.object({
  assetTag: z.string().min(1),
  observedLocationId: z.string().uuid(),
  notes: z.string().optional().nullable(),
});

export async function createSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { locationId, title } = createSessionSchema.parse(req.body);

    const location = await prisma.location.findUnique({
      where: { id: locationId },
      include: { _count: { select: { assets: true } } },
    });

    if (!location) throw new AppError('Location not found', 404, 'NOT_FOUND');

    const expectedAssetsCount = await prisma.asset.count({
      where: {
        currentLocationId: locationId,
        status: { in: ['in_service', 'in_storage', 'under_maintenance', 'transferred'] },
      },
    });

    const session = await prisma.stocktakeSession.create({
      data: {
        locationId,
        title,
        status: 'active',
        totalExpected: expectedAssetsCount,
      },
      include: { location: true },
    });

    const clientInfo = getRequestClientInfo(req);
    await logAudit({
      action: 'CREATE',
      tableName: 'stocktake_sessions',
      recordId: session.id,
      actorUserId: req.user?.id,
      metadata: { title: session.title, locationId: session.locationId },
      ...clientInfo,
    });

    sendSuccess(res, session, 201);
  } catch (err) {
    next(err);
  }
}

export async function recordScan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      throw new AppError('Session ID is required', 400, 'INVALID_SESSION_ID');
   }

   const { assetTag, observedLocationId, notes } = scanObservationSchema.parse(req.body);

    const session = await prisma.stocktakeSession.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'active') {
      throw new AppError('Active stocktake session not found', 404, 'SESSION_INACTIVE');
    }

    const asset = await prisma.asset.findUnique({ where: { assetTag } });
    if (!asset) {
      throw new AppError(`Asset with tag '${assetTag}' not registered in inventory`, 404, 'ASSET_NOT_FOUND');
    }

    // Determine verification status
    let status = 'verified';
    if (asset.currentLocationId !== session.locationId) {
      status = 'moved';
    } else if (observedLocationId !== session.locationId) {
      status = 'unexpected';
    }

    const observation = await prisma.stocktakeObservation.create({
      data: {
        sessionId,
        assetId: asset.id,
        observedLocationId,
        scannedByUserId: req.user!.id,
        status,
        notes: notes || null,
      },
      include: {
        asset: true,
        observedLocation: true,
      },
    });

    // Update scanned tally
    await prisma.stocktakeSession.update({
      where: { id: sessionId },
      data: {
        totalScanned: { increment: 1 },
        ...(status !== 'verified' ? { discrepanciesCount: { increment: 1 } } : {}),
      },
    });

    sendSuccess(res, observation, 201);
  } catch (err) {
    next(err);
  }
}

export async function getSessionReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId } = req.params;

    const session = await prisma.stocktakeSession.findUnique({
      where: { id: sessionId },
      include: {
        location: true,
        observations: {
          include: {
            asset: { include: { category: true, currentLocation: true } },
            scannedBy: { select: { id: true, fullName: true } },
            observedLocation: true,
          },
          orderBy: { scannedAt: 'desc' },
        },
      },
    });

    if (!session) throw new AppError('Session not found', 404, 'NOT_FOUND');

    const scannedAssetIds = session.observations.map((o) => o.assetId);

    // Find expected assets that were NOT scanned (Missing)
    const missingAssets = await prisma.asset.findMany({
      where: {
        currentLocationId: session.locationId,
        id: { notIn: scannedAssetIds },
        status: { in: ['in_service', 'in_storage', 'under_maintenance'] },
      },
      include: { category: true, custodian: { select: { id: true, fullName: true } } },
    });

    const verifiedCount = session.observations.filter((o) => o.status === 'verified').length;
    const movedCount = session.observations.filter((o) => o.status === 'moved').length;
    const unexpectedCount = session.observations.filter((o) => o.status === 'unexpected').length;
    const missingCount = missingAssets.length;

    sendSuccess(res, {
      session,
      summary: {
        totalExpected: session.totalExpected,
        totalScanned: session.totalScanned,
        verifiedCount,
        movedCount,
        unexpectedCount,
        missingCount,
        totalDiscrepancies: movedCount + unexpectedCount + missingCount,
      },
      missingAssets,
    });
  } catch (err) {
    next(err);
  }
}
