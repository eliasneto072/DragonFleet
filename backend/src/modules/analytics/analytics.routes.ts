import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { analyticsController } from './analytics.controller';

export function analyticsRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/stats', analyticsController.getStats);

  return router;
}