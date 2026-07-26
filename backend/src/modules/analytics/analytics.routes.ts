import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { analyticsController } from './analytics.controller';

export function analyticsRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  // Ambas exigem ADMIN ou MANAGER — validado dentro do service, não por
  // middleware de papel, para que a regra viaje com a lógica.
  router.get('/stats', analyticsController.getStats);
  router.get('/overview', analyticsController.getOverview);

  return router;
}
