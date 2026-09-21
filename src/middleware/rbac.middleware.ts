import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';
import { prisma } from '../database/prisma';

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, 'UNAUTHORIZED', 'Authentication required', undefined, req.id);
      return;
    }

    // Super admin has universal access
    const isSuperAdmin = req.user.roles.some((r) => r.roleCode === 'super_admin');
    if (isSuperAdmin) {
      next();
      return;
    }

    const hasRole = req.user.roles.some((r) => allowedRoles.includes(r.roleCode));
    if (!hasRole) {
      sendError(
        res,
        403,
        'FORBIDDEN',
        `Access denied. Requires one of roles: ${allowedRoles.join(', ')}`,
        undefined,
        req.id
      );
      return;
    }

    next();
  };
}

/**
 * Helper to fetch all descendant org unit IDs recursively
 */
export async function getDescendantOrgUnitIds(rootOrgUnitId: string): Promise<string[]> {
  const ids: string[] = [rootOrgUnitId];
  let currentParents = [rootOrgUnitId];

  while (currentParents.length > 0) {
    const children = await prisma.orgUnit.findMany({
      where: { parentId: { in: currentParents } },
      select: { id: true },
    });
    if (children.length === 0) break;
    const childIds = children.map((c) => c.id);
    ids.push(...childIds);
    currentParents = childIds;
  }

  return ids;
}

/**
 * Validates if the authenticated user has access to a target org unit (directly or as ancestor)
 */
export async function isOrgUnitInUserScope(
  userRoles: Array<{ roleCode: string; orgUnitId: string | null }>,
  targetOrgUnitId: string
): Promise<boolean> {
  // Super admin can access all org units
  if (userRoles.some((r) => r.roleCode === 'super_admin')) return true;

  // Global role without org unit scope
  if (userRoles.some((r) => r.orgUnitId === null)) return true;

  // Check if targetOrgUnitId is in any of the user's role scoped trees
  for (const role of userRoles) {
    if (role.orgUnitId) {
      if (role.orgUnitId === targetOrgUnitId) return true;
      const descendants = await getDescendantOrgUnitIds(role.orgUnitId);
      if (descendants.includes(targetOrgUnitId)) return true;
    }
  }

  return false;
}
