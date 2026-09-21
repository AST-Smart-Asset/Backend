import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { logAudit, getRequestClientInfo } from '../../middleware/audit.middleware';
import { isOrgUnitInUserScope } from '../../middleware/rbac.middleware';

const createLocationSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  locationType: z.enum(['campus', 'building', 'college_dept', 'floor', 'room', 'office', 'storage_area']),
  orgUnitId: z.string().uuid(),
  parentId: z.string().uuid().optional().nullable(),
});

export async function listLocations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { locationType, search, parentId, orgUnitId } = req.query;

    const whereClause: any = { isActive: true };

    if (locationType) whereClause.locationType = String(locationType);
    if (parentId) whereClause.parentId = String(parentId);
    if (orgUnitId) whereClause.orgUnitId = String(orgUnitId);
    if (search) {
      whereClause.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { code: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    const locations = await prisma.location.findMany({
      where: whereClause,
      include: {
        orgUnit: true,
        parent: true,
        _count: { select: { assets: true, children: true } },
      },
      orderBy: { name: 'asc' },
    });

    sendSuccess(res, locations);
  } catch (err) {
    next(err);
  }
}

export async function getLocationById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        orgUnit: true,
        parent: true,
        children: true,
        assets: {
          take: 50,
          include: { category: true },
        },
      },
    });

    if (!location) {
      throw new AppError('Location not found', 404, 'NOT_FOUND');
    }

    sendSuccess(res, location);
  } catch (err) {
    next(err);
  }
}

export async function createLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createLocationSchema.parse(req.body);

    const hasAccess = await isOrgUnitInUserScope(req.user!.roles, data.orgUnitId);
    if (!hasAccess) {
      throw new AppError('You do not have permission to create locations in this organizational scope', 403, 'SCOPE_FORBIDDEN');
    }

    if (data.parentId) {
      const parent = await prisma.location.findUnique({ where: { id: data.parentId } });
      if (!parent) {
        throw new AppError('Parent location not found', 400, 'INVALID_PARENT');
      }
    }

    const location = await prisma.location.create({
      data: {
        name: data.name,
        code: data.code,
        locationType: data.locationType,
        orgUnitId: data.orgUnitId,
        parentId: data.parentId || null,
      },
    });

    const clientInfo = getRequestClientInfo(req);
    await logAudit({
      action: 'CREATE',
      tableName: 'locations',
      recordId: location.id,
      actorUserId: req.user?.id,
      metadata: { name: location.name, code: location.code, type: location.locationType },
      ...clientInfo,
    });

    sendSuccess(res, location, 201);
  } catch (err) {
    next(err);
  }
}
