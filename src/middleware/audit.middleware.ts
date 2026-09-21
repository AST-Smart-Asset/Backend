import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/prisma';

export interface AuditEntryOptions {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'EXPORT' | 'PREDICTION_RUN' | 'ROLE_CHANGE';
  tableName: string;
  recordId?: string;
  metadata?: Record<string, any>;
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Sanitize sensitive keys (passwords, tokens, secrets) before audit logging.
 */
function sanitizePayload(payload?: Record<string, any>): Record<string, any> | undefined {
  if (!payload) return undefined;
  const sanitized: Record<string, any> = {};
  const sensitiveKeys = ['password', 'passwordHash', 'token', 'secret', 'accessToken', 'refreshToken'];

  for (const [key, value] of Object.entries(payload)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizePayload(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Write append-only record to audit_log table.
 */
export async function logAudit(options: AuditEntryOptions): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: options.action,
        tableName: options.tableName,
        recordId: options.recordId || null,
        metadata: sanitizePayload(options.metadata) || undefined,
        actorUserId: options.actorUserId || null,
        ipAddress: options.ipAddress || null,
        userAgent: options.userAgent || null,
      },
    });
  } catch (err) {
    console.error('⚠️ Failed to persist audit log entry:', err);
  }
}

/**
 * Helper to extract client IP and User-Agent from Express request
 */
export function getRequestClientInfo(req: Request) {
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || undefined;
  const userAgent = req.headers['user-agent'] || undefined;
  return { ipAddress, userAgent };
}
