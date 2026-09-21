import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { comparePassword } from '../../utils/password';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { logAudit, getRequestClientInfo } from '../../middleware/audit.middleware';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: { role: true, orgUnit: true },
        },
      },
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    if (user.status !== 'active') {
      throw new AppError('Account has been suspended or deactivated', 403, 'ACCOUNT_INACTIVE');
    }

    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const rolesPayload = user.userRoles.map((ur) => ({
      roleCode: ur.role.code,
      orgUnitId: ur.orgUnitId,
    }));

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      roles: rolesPayload,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Audit login
    const clientInfo = getRequestClientInfo(req);
    await logAudit({
      action: 'APPROVE',
      tableName: 'users',
      recordId: user.id,
      actorUserId: user.id,
      metadata: { event: 'user_login', email: user.email },
      ...clientInfo,
    });

    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles: user.userRoles.map((ur) => ({
          role: ur.role.code,
          roleName: ur.role.name,
          orgUnitId: ur.orgUnitId,
          orgUnitName: ur.orgUnit?.name,
        })),
      },
      tokens: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function refreshTokens(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const decoded = verifyRefreshToken(refreshToken);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    if (!user || user.status !== 'active') {
      throw new AppError('User inactive or invalid', 401, 'UNAUTHORIZED');
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      roles: user.userRoles.map((ur) => ({
        roleCode: ur.role.code,
        orgUnitId: ur.orgUnitId,
      })),
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    sendSuccess(res, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
    });
  } catch (err: any) {
    next(new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN'));
  }
}

export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        mfaEnabled: true,
        createdAt: true,
        userRoles: {
          include: {
            role: true,
            orgUnit: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}
