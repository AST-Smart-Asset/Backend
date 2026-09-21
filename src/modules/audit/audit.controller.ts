import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../database/prisma';
import { sendSuccess } from '../../utils/response';

export async function listAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      page = '1',
      limit = '50',
      action,
      tableName,
      recordId,
      actorUserId,
    } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (action) where.action = String(action);
    if (tableName) where.tableName = String(tableName);
    if (recordId) where.recordId = String(recordId);
    if (actorUserId) where.actorUserId = String(actorUserId);

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, fullName: true, email: true } },
        },
      }),
    ]);

    sendSuccess(res, logs, 200, {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    next(err);
  }
}

export async function listAllAssetEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      page = '1',
      limit = '50',
      eventType,
      assetId,
    } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (eventType) where.eventType = String(eventType);
    if (assetId) where.assetId = String(assetId);

    const [total, events] = await Promise.all([
      prisma.assetEvent.count({ where }),
      prisma.assetEvent.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          asset: { select: { id: true, assetTag: true, serialNumber: true } },
          actor: { select: { id: true, fullName: true, email: true } },
          fromLocation: true,
          toLocation: true,
          fromCustodian: { select: { id: true, fullName: true } },
          toCustodian: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    sendSuccess(res, events, 200, {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    next(err);
  }
}
