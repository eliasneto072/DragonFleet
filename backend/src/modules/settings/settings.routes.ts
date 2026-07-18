// src/modules/settings/settings.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/role.middleware';
import { settingsController } from './settings.controller';

export function settingsRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  // Any authenticated user can read (frontend needs withdrawal limits, etc.)
  router.get('/', settingsController.get);

  // Only admins can change settings (also re-checked in the service)
  router.put('/', requireAdmin, settingsController.update);

  return router;
}
