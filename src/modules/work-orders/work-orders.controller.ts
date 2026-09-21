import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { logAudit, getRequestClientInfo } from '../../middleware/audit.middleware';

const createWorkOrderSchema = z.object({
  assetId: z.string().uuid(),
  templateId: z.string().uuid().optional().nullable(),
  technicianUserId: z.string().uuid().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  scheduledDate: z.string().datetime().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const closeWorkOrderSchema = z.object({
  outcome: z.enum(['passed', 'repaired', 'replaced_parts', 'unresolvable']),
  cost: z.number().nonnegative().optional().default(0),
  downtimeHours: z.number().nonnegative().optional().default(0),
  completionNotes: z.string().min(5),
  checklistResults: z.record(z.any()).optional().nullable(),
  assetNewCondition: z.enum(['excellent', 'good', 'fair', 'poor', 'damaged']).optional(),
});

export async function listWorkOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, priority, technicianId, assetId } = req.query;

    const where: any = {};
    if (status) where.status = String(status);
    if (priority) where.priority = String(priority);
    if (technicianId) where.technicianUserId = String(technicianId);
    if (assetId) where.assetId = String(assetId);

    const orders = await prisma.workOrder.findMany({
      where,
      include: {
        asset: {
          include: { currentLocation: true, category: true },
        },
        template: true,
        technician: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    sendSuccess(res, orders);
  } catch (err) {
    next(err);
  }
}

export async function createWorkOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createWorkOrderSchema.parse(req.body);

    const asset = await prisma.asset.findUnique({ where: { id: data.assetId } });
    if (!asset) throw new AppError('Asset not found', 404, 'NOT_FOUND');

    let defaultDueDate: Date | null = null;
    if (data.dueDate) {
      defaultDueDate = new Date(data.dueDate);
    } else if (data.templateId) {
      const template = await prisma.maintenanceTemplate.findUnique({ where: { id: data.templateId } });
      if (template?.intervalDays) {
        defaultDueDate = new Date(Date.now() + template.intervalDays * 24 * 60 * 60 * 1000);
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.workOrder.create({
        data: {
          assetId: data.assetId,
          templateId: data.templateId || null,
          technicianUserId: data.technicianUserId || null,
          priority: data.priority,
          status: data.technicianUserId ? 'assigned' : 'draft',
          scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
          dueDate: defaultDueDate,
          createdBy: req.user?.id,
        },
        include: { asset: true, template: true, technician: true },
      });

      await tx.assetEvent.create({
        data: {
          assetId: data.assetId,
          actorUserId: req.user?.id,
          toLocationId: asset.currentLocationId,
          eventType: 'maintenance_scheduled',
          eventData: {
            workOrderId: created.id,
            priority: created.priority,
            dueDate: created.dueDate,
          },
        },
      });

      return created;
    });

    const clientInfo = getRequestClientInfo(req);
    await logAudit({
      action: 'CREATE',
      tableName: 'work_orders',
      recordId: order.id,
      actorUserId: req.user?.id,
      metadata: { assetId: order.assetId, priority: order.priority },
      ...clientInfo,
    });

    sendSuccess(res, order, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * AST-FR-06 Complete and close work order, recalculating next due date
 */
export async function closeWorkOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const data = closeWorkOrderSchema.parse(req.body);

    const order = await prisma.workOrder.findUnique({
      where: { id },
      include: { template: true, asset: true },
    });

    if (!order) throw new AppError('Work order not found', 404, 'NOT_FOUND');
    if (order.status === 'completed' || order.status === 'cancelled') {
      throw new AppError('Work order is already closed', 400, 'ORDER_CLOSED');
    }

    const completedAt = new Date();

    // Calculate next due date from template interval if template is linked (AST-FR-05, AST-FR-06)
    let nextDueAt: Date | null = null;
    if (order.template?.intervalDays) {
      nextDueAt = new Date(completedAt.getTime() + order.template.intervalDays * 24 * 60 * 60 * 1000);
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.workOrder.update({
        where: { id },
        data: {
          status: 'completed',
          outcome: data.outcome,
          cost: data.cost,
          downtimeHours: data.downtimeHours,
          completionNotes: data.completionNotes,
          checklistResults: data.checklistResults || undefined,
          completedAt,
          nextDueAt,
        },
      });

      // Update asset operational status back to in_service (or condition update)
      await tx.asset.update({
        where: { id: order.assetId },
        data: {
          status: 'in_service',
          condition: data.assetNewCondition || order.asset.condition,
          updatedBy: req.user?.id,
        },
      });

      // Immutable maintenance completed event (AST-FR-04, AST-FR-06)
      await tx.assetEvent.create({
        data: {
          assetId: order.assetId,
          actorUserId: req.user?.id,
          toLocationId: order.asset.currentLocationId,
          eventType: 'maintenance_completed',
          eventData: {
            workOrderId: id,
            outcome: data.outcome,
            cost: data.cost,
            downtimeHours: data.downtimeHours,
            completionNotes: data.completionNotes,
            nextDueAt,
          },
        },
      });

      return updatedOrder;
    });

    const clientInfo = getRequestClientInfo(req);
    await logAudit({
      action: 'APPROVE',
      tableName: 'work_orders',
      recordId: id,
      actorUserId: req.user?.id,
      metadata: { action: 'close_work_order', outcome: data.outcome, nextDueAt },
      ...clientInfo,
    });

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
