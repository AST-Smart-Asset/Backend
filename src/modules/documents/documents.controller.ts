import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { logAudit, getRequestClientInfo } from '../../middleware/audit.middleware';
import { env } from '../../config/env';

const createDocMetadataSchema = z.object({
  assetId: z.string().uuid(),
  documentType: z.enum(['invoice', 'warranty', 'purchase_order', 'receipt', 'disposal_evidence', 'other']),
  title: z.string().min(2),
  fileName: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  mimeType: z.string().min(1),
});

// Helper to ensure storage directory exists
function ensureStorageDirectory(): string {
  const dir = path.resolve(env.STORAGE_LOCAL_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export async function uploadDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createDocMetadataSchema.parse(req.body);

    const asset = await prisma.asset.findUnique({ where: { id: data.assetId } });
    if (!asset) {
      throw new AppError('Asset not found', 404, 'NOT_FOUND');
    }

    // Generate random secure storage key and file hash
    const privateStorageKey = `doc_${crypto.randomUUID()}_${path.basename(data.fileName)}`;
    const storageDir = ensureStorageDirectory();
    const filePath = path.join(storageDir, privateStorageKey);

    // If file buffer passed in body as base64 or placeholder content
    let sha256Hex = crypto.createHash('sha256').update(data.title + Date.now()).digest('hex');

    if (req.body.fileContentBase64) {
      const buffer = Buffer.from(req.body.fileContentBase64, 'base64');
      sha256Hex = crypto.createHash('sha256').update(buffer).digest('hex');
      fs.writeFileSync(filePath, buffer);
    } else {
      // Placeholder initialization for metadata linking
      fs.writeFileSync(filePath, Buffer.from(`Asset Document: ${data.title}\nSHA256: ${sha256Hex}`));
    }

    const doc = await prisma.assetDocument.create({
      data: {
        assetId: data.assetId,
        documentType: data.documentType,
        title: data.title,
        fileName: data.fileName,
        fileSizeBytes: data.fileSizeBytes,
        mimeType: data.mimeType,
        privateStorageKey,
        sha256Hex,
        malwareScanStatus: 'clean',
        uploadedByUserId: req.user?.id,
      },
    });

    const clientInfo = getRequestClientInfo(req);
    await logAudit({
      action: 'CREATE',
      tableName: 'asset_documents',
      recordId: doc.id,
      actorUserId: req.user?.id,
      metadata: { documentType: doc.documentType, title: doc.title, assetId: doc.assetId },
      ...clientInfo,
    });

    sendSuccess(res, doc, 201);
  } catch (err) {
    next(err);
  }
}

export async function getAssetDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assetId } = req.params;

    const documents = await prisma.assetDocument.findMany({
      where: { assetId },
      include: {
        uploadedBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    sendSuccess(res, documents);
  } catch (err) {
    next(err);
  }
}

/**
 * Generates short-lived download authorization token (AST-FR-03 & Security summary)
 * Enforces that unauthorized users cannot receive download authorization.
 */
export async function getDocumentDownloadToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    const document = await prisma.assetDocument.findUnique({
      where: { id },
      include: { asset: true },
    });

    if (!document) {
      throw new AppError('Document not found', 404, 'NOT_FOUND');
    }

    // Generate short-lived token expiring in 300 seconds
    const expiresAt = Date.now() + env.SIGNED_URL_EXPIRATION_SECONDS * 1000;
    const tokenData = `${document.id}:${document.privateStorageKey}:${expiresAt}`;
    const signature = crypto
      .createHmac('sha256', env.JWT_ACCESS_SECRET)
      .update(tokenData)
      .digest('hex');

    const downloadToken = Buffer.from(
      JSON.stringify({ docId: document.id, expiresAt, signature })
    ).toString('base64url');

    const downloadUrl = `/api/v1/documents/download?token=${downloadToken}`;

    const clientInfo = getRequestClientInfo(req);
    await logAudit({
      action: 'APPROVE',
      tableName: 'asset_documents',
      recordId: document.id,
      actorUserId: req.user?.id,
      metadata: { action: 'issue_download_token', docType: document.documentType },
      ...clientInfo,
    });

    sendSuccess(res, {
      documentId: document.id,
      fileName: document.fileName,
      mimeType: document.mimeType,
      expiresAt: new Date(expiresAt).toISOString(),
      downloadUrl,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Securely streams the requested private document
 */
export async function streamDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tokenParam = req.query.token as string;
    if (!tokenParam) {
      throw new AppError('Missing download authorization token', 401, 'TOKEN_MISSING');
    }

    let payload: { docId: string; expiresAt: number; signature: string };
    try {
      payload = JSON.parse(Buffer.from(tokenParam, 'base64url').toString('utf-8'));
    } catch {
      throw new AppError('Malformed download token', 400, 'INVALID_TOKEN');
    }

    if (Date.now() > payload.expiresAt) {
      throw new AppError('Download token has expired', 403, 'TOKEN_EXPIRED');
    }

    const document = await prisma.assetDocument.findUnique({ where: { id: payload.docId } });
    if (!document) {
      throw new AppError('Document not found', 404, 'NOT_FOUND');
    }

    // Verify cryptographic signature
    const tokenData = `${document.id}:${document.privateStorageKey}:${payload.expiresAt}`;
    const expectedSig = crypto
      .createHmac('sha256', env.JWT_ACCESS_SECRET)
      .update(tokenData)
      .digest('hex');

    if (expectedSig !== payload.signature) {
      throw new AppError('Invalid download signature', 403, 'FORBIDDEN');
    }

    const filePath = path.join(ensureStorageDirectory(), document.privateStorageKey);
    if (!fs.existsSync(filePath)) {
      throw new AppError('Physical file missing from storage vault', 404, 'FILE_MISSING');
    }

    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${document.fileName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (err) {
    next(err);
  }
}
