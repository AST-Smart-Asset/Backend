import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import yaml from 'yamljs';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import { sendSuccess, sendError } from './utils/response';

// Route imports
import authRoutes from './modules/auth/auth.routes';
import orgUnitsRoutes from './modules/org-units/org-units.routes';
import locationsRoutes from './modules/locations/locations.routes';
import categoriesRoutes from './modules/categories/categories.routes';
import assetsRoutes from './modules/assets/assets.routes';
import documentsRoutes from './modules/documents/documents.routes';
import custodyRoutes from './modules/custody/custody.routes';
import maintenanceRoutes from './modules/maintenance/maintenance.routes';
import workOrdersRoutes from './modules/work-orders/work-orders.routes';
import stocktakeRoutes from './modules/stocktake/stocktake.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import predictionsRoutes from './modules/predictions/predictions.routes';
import disposalRoutes from './modules/disposal/disposal.routes';
import auditRoutes from './modules/audit/audit.routes';

export function createApp(): Application {
  const app = express();

  // 1. Security & Headers Middleware
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: '*', credentials: true }));
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // 2. Correlation ID
  app.use(requestIdMiddleware);

  // 3. Rate Limiting (200 req / 15 min window)
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests created from this IP, please try again after 15 minutes',
      },
    },
  });
  app.use('/api/', limiter);

  // 4. Liveness & Readiness Health Endpoint (Common Architecture standard)
  app.get('/health', (_req: Request, res: Response) => {
    sendSuccess(res, {
      status: 'UP',
      service: 'smart-asset-backend',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.get(`${env.API_PREFIX}/health`, (_req: Request, res: Response) => {
    sendSuccess(res, {
      status: 'UP',
      service: 'smart-asset-backend',
      prefix: env.API_PREFIX,
      timestamp: new Date().toISOString(),
    });
  });

  // 5. OpenAPI Swagger Documentation
  const openApiPath = path.resolve(process.cwd(), 'docs/openapi.yaml');
  if (fs.existsSync(openApiPath)) {
    try {
      const swaggerDocument = yaml.load(openApiPath);
      app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    } catch (e) {
      console.warn('⚠️ Could not load OpenAPI documentation:', e);
    }
  }

  // 6. Primary API Modules
  app.use(`${env.API_PREFIX}/auth`, authRoutes);
  app.use(`${env.API_PREFIX}/org-units`, orgUnitsRoutes);
  app.use(`${env.API_PREFIX}/locations`, locationsRoutes);
  app.use(`${env.API_PREFIX}/categories`, categoriesRoutes);
  app.use(`${env.API_PREFIX}/assets`, assetsRoutes);
  app.use(`${env.API_PREFIX}/documents`, documentsRoutes);
  app.use(`${env.API_PREFIX}/custody`, custodyRoutes);
  app.use(`${env.API_PREFIX}/maintenance`, maintenanceRoutes);
  app.use(`${env.API_PREFIX}/work-orders`, workOrdersRoutes);
  app.use(`${env.API_PREFIX}/stocktake`, stocktakeRoutes);
  app.use(`${env.API_PREFIX}/dashboard`, dashboardRoutes);
  app.use(`${env.API_PREFIX}/predictions`, predictionsRoutes);
  app.use(`${env.API_PREFIX}/disposal`, disposalRoutes);
  app.use(`${env.API_PREFIX}/audit`, auditRoutes);

  // 7. 404 Route Catch-all
  app.use('*', (req: Request, res: Response) => {
    sendError(res, 404, 'NOT_FOUND', `Route ${req.originalUrl} not found`, undefined, req.id);
  });

  // 8. Global Error Handling Middleware
  app.use(errorMiddleware);

  return app;
}
