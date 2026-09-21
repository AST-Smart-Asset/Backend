import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { logAudit, getRequestClientInfo } from '../../middleware/audit.middleware';

const createCategorySchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  usefulLifeMonths: z.number().int().positive().default(36),
  requiresSerial: z.boolean().default(true),
  parentId: z.string().uuid().optional().nullable(),
});

export async function listCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await prisma.assetCategory.findMany({
      include: {
        parent: true,
        children: true,
        _count: { select: { assets: true, templates: true } },
      },
      orderBy: { name: 'asc' },
    });
    sendSuccess(res, categories);
  } catch (err) {
    next(err);
  }
}

export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createCategorySchema.parse(req.body);

    const existing = await prisma.assetCategory.findUnique({ where: { code: data.code } });
    if (existing) {
      throw new AppError('Category code already in use', 409, 'DUPLICATE_CODE');
    }

    const category = await prisma.assetCategory.create({
      data: {
        name: data.name,
        code: data.code,
        usefulLifeMonths: data.usefulLifeMonths,
        requiresSerial: data.requiresSerial,
        parentId: data.parentId || null,
      },
    });

    const clientInfo = getRequestClientInfo(req);
    await logAudit({
      action: 'CREATE',
      tableName: 'asset_categories',
      recordId: category.id,
      actorUserId: req.user?.id,
      metadata: { name: category.name, code: category.code },
      ...clientInfo,
    });

    sendSuccess(res, category, 201);
  } catch (err) {
    next(err);
  }
}
