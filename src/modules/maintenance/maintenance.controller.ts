import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { logAudit, getRequestClientInfo } from '../../middleware/audit.middleware';

const templateSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().min(3),
  triggerType: z.enum(['calendar', 'runtime', 'condition']),
  intervalDays: z.number().int().positive().optional().nullable(),
  runtimeHours: z.number().int().positive().optional().nullable(),
  conditionRule: z.record(z.any()).optional().nullable(),
  checklist: z.array(z.string()).optional().nullable(),
});

export async function listTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { categoryId } = req.query;
    const where: any = {};
    if (categoryId) where.categoryId = String(categoryId);

    const templates = await prisma.maintenanceTemplate.findMany({
      where,
      include: {
        category: true,
        _count: { select: { workOrders: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    sendSuccess(res, templates);
  } catch (err) {
    next(err);
  }
}

export async function createTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = templateSchema.parse(req.body);

    const category = await prisma.assetCategory.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new AppError('Asset category not found', 400, 'INVALID_CATEGORY');

    const template = await prisma.maintenanceTemplate.create({
      data: {
        categoryId: data.categoryId,
        title: data.title,
        triggerType: data.triggerType,
        intervalDays: data.intervalDays || null,
        runtimeHours: data.runtimeHours || null,
        conditionRule: data.conditionRule || undefined,
        checklist: data.checklist || undefined,
      },
    });

    const clientInfo = getRequestClientInfo(req);
    await logAudit({
      action: 'CREATE',
      tableName: 'maintenance_templates',
      recordId: template.id,
      actorUserId: req.user?.id,
      metadata: { title: template.title, triggerType: template.triggerType },
      ...clientInfo,
    });

    sendSuccess(res, template, 201);
  } catch (err) {
    next(err);
  }
}
