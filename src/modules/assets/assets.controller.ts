import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { logAudit, getRequestClientInfo } from '../../middleware/audit.middleware';

const assetSchema = z.object({
  assetTag: z.string().min(3),
  serialNumber: z.string().optional().nullable(),
  categoryId: z.string().uuid(),
  currentLocationId: z.string().uuid(),
  custodianUserId: z.string().uuid().optional().nullable(),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  specifications: z.record(z.any()).optional().nullable(),
  condition: z.enum(['excellent', 'good', 'fair', 'poor', 'damaged']).default('good'),
  status: z.enum(['in_service', 'in_storage', 'under_maintenance', 'transferred', 'disposed', 'retired', 'missing']).default('in_service'),
  purchaseDate: z.string().datetime().optional().nullable(),
  purchaseCost: z.number().positive().optional().nullable(),
});

const batchImportSchema = z.object({
  assets: z.array(assetSchema),
});

export async function listAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      page = '1',
      limit = '20',
      search,
      status,
      condition,
      riskBand,
      categoryId,
      locationId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status) where.status = String(status);
    if (condition) where.condition = String(condition);
    if (riskBand) where.riskBand = String(riskBand);
    if (categoryId) where.categoryId = String(categoryId);
    if (locationId) where.currentLocationId = String(locationId);

    if (search) {
      where.OR = [
        { assetTag: { contains: String(search), mode: 'insensitive' } },
        { serialNumber: { contains: String(search), mode: 'insensitive' } },
        { brand: { contains: String(search), mode: 'insensitive' } },
        { model: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    const [total, assets] = await Promise.all([
      prisma.asset.count({ where }),
      prisma.asset.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [String(sortBy)]: sortOrder === 'asc' ? 'asc' : 'desc' },
        include: {
          category: true,
          currentLocation: {
            include: { orgUnit: true },
          },
          custodian: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
    ]);

    sendSuccess(res, assets, 200, {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    next(err);
  }
}

export async function getAssetById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        category: true,
        currentLocation: {
          include: { orgUnit: true, parent: true },
        },
        custodian: {
          select: { id: true, fullName: true, email: true },
        },
        documents: true,
        events: {
          include: {
            actor: { select: { id: true, fullName: true } },
            fromLocation: true,
            toLocation: true,
            fromCustodian: { select: { id: true, fullName: true } },
            toCustodian: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        workOrders: {
          include: {
            technician: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!asset) {
      throw new AppError('Asset record not found', 404, 'NOT_FOUND');
    }

    sendSuccess(res, asset);
  } catch (err) {
    next(err);
  }
}

export async function createAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = assetSchema.parse(req.body);

    // Validate unique assetTag
    const existingTag = await prisma.asset.findUnique({ where: { assetTag: data.assetTag } });
    if (existingTag) {
      throw new AppError(`Asset tag '${data.assetTag}' is already registered`, 409, 'DUPLICATE_ASSET_TAG');
    }

    // Validate serialNumber if provided
    if (data.serialNumber) {
      const existingSerial = await prisma.asset.findUnique({ where: { serialNumber: data.serialNumber } });
      if (existingSerial) {
        throw new AppError(`Serial number '${data.serialNumber}' is already registered`, 409, 'DUPLICATE_SERIAL_NUMBER');
      }
    }

    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.asset.create({
        data: {
          assetTag: data.assetTag,
          serialNumber: data.serialNumber || null,
          categoryId: data.categoryId,
          currentLocationId: data.currentLocationId,
          custodianUserId: data.custodianUserId || null,
          brand: data.brand || null,
          model: data.model || null,
          specifications: data.specifications || undefined,
          condition: data.condition,
          status: data.status,
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
          purchaseCost: data.purchaseCost || null,
          createdBy: req.user?.id,
        },
      });

      // Append immutable asset registration event (AST-FR-04)
      await tx.assetEvent.create({
        data: {
          assetId: created.id,
          actorUserId: req.user?.id,
          toLocationId: created.currentLocationId,
          toCustodianId: created.custodianUserId,
          eventType: 'registered',
          eventData: {
            assetTag: created.assetTag,
            initialCondition: created.condition,
            initialStatus: created.status,
          },
        },
      });

      return created;
    });

    const clientInfo = getRequestClientInfo(req);
    await logAudit({
      action: 'CREATE',
      tableName: 'assets',
      recordId: asset.id,
      actorUserId: req.user?.id,
      metadata: { assetTag: asset.assetTag, serial: asset.serialNumber },
      ...clientInfo,
    });

    sendSuccess(res, asset, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * AST-FR-02 Batch import with duplicate tag/serial error reporting
 */
export async function batchImportAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assets } = batchImportSchema.parse(req.body);

    const errors: Array<{ row: number; assetTag: string; field: string; error: string }> = [];
    const validAssetsToInsert: any[] = [];

    // In-memory duplicate checks within the batch itself
    const seenTags = new Set<string>();
    const seenSerials = new Set<string>();

    // Preload existing tags and serials from database
    const tagsInBatch = assets.map((a) => a.assetTag);
    const serialsInBatch = assets.map((a) => a.serialNumber).filter(Boolean) as string[];

    const [existingDbTags, existingDbSerials] = await Promise.all([
      prisma.asset.findMany({
        where: { assetTag: { in: tagsInBatch } },
        select: { assetTag: true },
      }),
      prisma.asset.findMany({
        where: { serialNumber: { in: serialsInBatch } },
        select: { serialNumber: true },
      }),
    ]);

    const existingTagSet = new Set(existingDbTags.map((t) => t.assetTag));
    const existingSerialSet = new Set(existingDbSerials.map((s) => s.serialNumber));

    assets.forEach((item, index) => {
      const row = index + 1;

      // Check Tag
      if (seenTags.has(item.assetTag)) {
        errors.push({ row, assetTag: item.assetTag, field: 'assetTag', error: 'Duplicate asset tag in import payload' });
        return;
      }
      if (existingTagSet.has(item.assetTag)) {
        errors.push({ row, assetTag: item.assetTag, field: 'assetTag', error: 'Asset tag already exists in database' });
        return;
      }
      seenTags.add(item.assetTag);

      // Check Serial
      if (item.serialNumber) {
        if (seenSerials.has(item.serialNumber)) {
          errors.push({ row, assetTag: item.assetTag, field: 'serialNumber', error: 'Duplicate serial number in import payload' });
          return;
        }
        if (existingSerialSet.has(item.serialNumber)) {
          errors.push({ row, assetTag: item.assetTag, field: 'serialNumber', error: 'Serial number already exists in database' });
          return;
        }
        seenSerials.add(item.serialNumber);
      }

      validAssetsToInsert.push({
        data: {
          assetTag: item.assetTag,
          serialNumber: item.serialNumber || null,
          categoryId: item.categoryId,
          currentLocationId: item.currentLocationId,
          custodianUserId: item.custodianUserId || null,
          brand: item.brand || null,
          model: item.model || null,
          specifications: item.specifications || undefined,
          condition: item.condition,
          status: item.status,
          purchaseDate: item.purchaseDate ? new Date(item.purchaseDate) : null,
          purchaseCost: item.purchaseCost || null,
          createdBy: req.user?.id,
        },
      });
    });

    // Insert valid assets
    const createdAssets: any[] = [];
    if (validAssetsToInsert.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const item of validAssetsToInsert) {
          const created = await tx.asset.create({ data: item.data });
          await tx.assetEvent.create({
            data: {
              assetId: created.id,
              actorUserId: req.user?.id,
              toLocationId: created.currentLocationId,
              toCustodianId: created.custodianUserId,
              eventType: 'registered',
              eventData: { batchImport: true, tag: created.assetTag },
            },
          });
          createdAssets.push(created);
        }
      });
    }

    const clientInfo = getRequestClientInfo(req);
    await logAudit({
      action: 'CREATE',
      tableName: 'assets',
      actorUserId: req.user?.id,
      metadata: {
        totalSubmitted: assets.length,
        importedCount: createdAssets.length,
        failedCount: errors.length,
      },
      ...clientInfo,
    });

    sendSuccess(res, {
      totalSubmitted: assets.length,
      importedCount: createdAssets.length,
      failedCount: errors.length,
      errors,
      importedAssets: createdAssets,
    }, 201);
  } catch (err) {
    next(err);
  }
}
