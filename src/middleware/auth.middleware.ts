import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';
import { sendError } from '../utils/response';
import { prisma } from '../database/prisma';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  roles: Array<{
    roleCode: string;
    orgUnitId: string | null;
  }>;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 401, 'UNAUTHORIZED', 'Missing or invalid Authorization header', undefined, req.id);
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyAccessToken(token);

    // Verify user exists and is active in database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user || user.status !== 'active') {
      sendError(res, 403, 'ACCOUNT_INACTIVE', 'User account is inactive or not found', undefined, req.id);
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.userRoles.map((ur) => ({
        roleCode: ur.role.code,
        orgUnitId: ur.orgUnitId,
      })),
    };

    next();
  } catch (err: any) {
    sendError(res, 401, 'TOKEN_INVALID', 'Invalid or expired access token', err.message, req.id);
  }
}
