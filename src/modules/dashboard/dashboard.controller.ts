import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../database/prisma';
import { sendSuccess } from '../../utils/response';
import { getDescendantOrgUnitIds } from '../../middleware/rbac.middleware';

/**
 * AST-FR-08 Role-scoped reconciled Dashboard KPIs
 */
export async function getDashboardKPIs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const isSuperAdmin = user.roles.some((r) => r.roleCode === 'super_admin');
    const isGlobal = user.roles.some((r) => r.orgUnitId === null);

    let allowedOrgUnitIds: string[] = [];

    if (!isSuperAdmin && !isGlobal) {
      // Gather all scoped org units and their children
      for (const r of user.roles) {
        if (r.orgUnitId) {
          const descendants = await getDescendantOrgUnitIds(r.orgUnitId);
          allowedOrgUnitIds.push(...descendants);
        }
      }
      allowedOrgUnitIds = Array.from(new Set(allowedOrgUnitIds));
    }

    // Build location scope filter
    let locationScopeFilter: any = {};
    if (allowedOrgUnitIds.length > 0) {
      locationScopeFilter = { orgUnitId: { in: allowedOrgUnitIds } };
    }

    // Base asset where filter
    const assetWhere: any = {};
    if (allowedOrgUnitIds.length > 0) {
      assetWhere.currentLocation = { orgUnitId: { in: allowedOrgUnitIds } };
    }

    const now = new Date();

    // Reconciled aggregate queries
    const [
      totalCount,
      assetsWithCost,
      statusGroups,
      conditionGroups,
      riskGroups,
      activeWorkOrders,
      overdueOrders,
      completedOrdersAggregation,
    ] = await Promise.all([
      prisma.asset.count({ where: assetWhere }),
      prisma.asset.findMany({
        where: { ...assetWhere, purchaseCost: { not: null } },
        select: { purchaseCost: true },
      }),
      prisma.asset.groupBy({
        by: ['status'],
        where: assetWhere,
        _count: { _all: true },
      }),
      prisma.asset.groupBy({
        by: ['condition'],
        where: assetWhere,
        _count: { _all: true },
      }),
      prisma.asset.groupBy({
        by: ['riskBand'],
        where: assetWhere,
        _count: { _all: true },
      }),
      prisma.workOrder.count({
        where: {
          asset: assetWhere,
          status: { in: ['assigned', 'in_progress'] },
        },
      }),
      prisma.workOrder.count({
        where: {
          asset: assetWhere,
          dueDate: { lt: now },
          status: { notIn: ['completed', 'cancelled'] },
        },
      }),
      prisma.workOrder.aggregate({
        where: {
          asset: assetWhere,
          status: 'completed',
        },
        _sum: {
          cost: true,
          downtimeHours: true,
        },
      }),
    ]);

    const totalValue = assetsWithCost.reduce((sum, a) => {
      return sum + (a.purchaseCost ? Number(a.purchaseCost) : 0);
    }, 0);

    const statusBreakdown = statusGroups.reduce((acc, curr) => {
      acc[curr.status] = curr._count._all;
      return acc;
    }, {} as Record<string, number>);

    const conditionBreakdown = conditionGroups.reduce((acc, curr) => {
      acc[curr.condition] = curr._count._all;
      return acc;
    }, {} as Record<string, number>);

    const riskBreakdown = riskGroups.reduce((acc, curr) => {
      acc[curr.riskBand] = curr._count._all;
      return acc;
    }, {} as Record<string, number>);

    sendSuccess(res, {
      scope: {
        isUniversal: isSuperAdmin || isGlobal,
        allowedOrgUnitCount: allowedOrgUnitIds.length,
      },
      summary: {
        totalAssets: totalCount,
        totalAssetValue: totalValue,
        activeWorkOrders,
        overdueMaintenanceCount: overdueOrders,
        totalMaintenanceCost: Number(completedOrdersAggregation._sum.cost || 0),
        totalDowntimeHours: Number(completedOrdersAggregation._sum.downtimeHours || 0),
      },
      distributions: {
        byStatus: statusBreakdown,
        byCondition: conditionBreakdown,
        byRiskBand: riskBreakdown,
      },
      timestamp: now.toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
