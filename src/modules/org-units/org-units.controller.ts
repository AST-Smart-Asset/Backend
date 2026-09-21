import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { logAudit, getRequestClientInfo } from '../../middleware/audit.middleware';

const createOrgUnitSchema = z.object({
  name: z.string().min(2),
  unitType: z.enum(['university', 'campus', 'college', 'department']),
  parentId: z.string().uuid().optional().nullable(),
});

export async function listOrgUnits(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgUnits = await prisma.orgUnit.findMany({
      where: { isActive: true },
      include: {
        children: true,
      },
      orderBy: { name: 'asc' },
    });
    sendSuccess(res, orgUnits);
  } catch (err) {
    next(err);
  }
}

export async function createOrgUnit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createOrgUnitSchema.parse(req.body);

    if (data.parentId) {
      const parent = await prisma.orgUnit.findUnique({ where: { id: data.parentId } });
      if (!parent) {
        throw new AppError('Parent organizational unit does not exist', 400, 'INVALID_PARENT');
      }
    }

    const orgUnit = await prisma.orgUnit.create({
      data: {
        name: data.name,
        unitType: data.unitType,
        parentId: data.parentId || null,
      },
    });

    const clientInfo = getRequestClientInfo(req);
    await logAudit({
      action: 'CREATE',
      tableName: 'org_units',
      recordId: orgUnit.id,
      actorUserId: req.user?.id,
      metadata: { name: orgUnit.name, unitType: orgUnit.unitType },
      ...clientInfo,
    });

    sendSuccess(res, orgUnit, 201);
  } catch (err) {
    next(err);
  }
}
