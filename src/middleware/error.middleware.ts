import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { sendError } from '../utils/response';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST', details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorMiddleware(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.id;

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));
    sendError(res, 422, 'VALIDATION_ERROR', 'Input validation failed', details, requestId);
    return;
  }

  // Handle Custom Application Errors
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, err.details, requestId);
    return;
  }

  // Handle Prisma Known Request Errors
  if (err.code === 'P2002') {
    const targets = (err.meta?.target as string[]) || ['unique field'];
    sendError(
      res,
      409,
      'DUPLICATE_ENTRY',
      `Unique constraint violation on ${targets.join(', ')}`,
      err.meta,
      requestId
    );
    return;
  }

  if (err.code === 'P2025') {
    sendError(res, 404, 'NOT_FOUND', 'Requested database record not found', undefined, requestId);
    return;
  }

  // Default Internal Server Error
  console.error(`[Error] Request ${requestId} failed:`, err);
  sendError(
    res,
    500,
    'INTERNAL_SERVER_ERROR',
    'An unexpected internal server error occurred',
    process.env.NODE_ENV === 'development' ? err.stack : undefined,
    requestId
  );
}
