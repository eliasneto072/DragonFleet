// src/modules/reports/reports.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/role.middleware';
import { reportsController } from './reports.controller';

export function reportsRouter(): Router {
  const router = Router();

  // Every report route requires a valid token AND the ADMIN role.
  router.use(authMiddleware);
  router.use(requireAdmin);

  router.get('/financial.pdf', reportsController.financialPdf);

  return router;
}
