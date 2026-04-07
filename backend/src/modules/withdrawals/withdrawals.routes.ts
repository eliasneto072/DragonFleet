import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { withdrawalsController } from './withdrawals.controller';

export function withdrawalsRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', withdrawalsController.list);
  router.get('/user/:userId', withdrawalsController.listByUser);
  router.get('/:id', withdrawalsController.getById);
  router.post('/', withdrawalsController.create);
  router.patch('/:id/status', withdrawalsController.updateStatus);
  router.delete('/:id', withdrawalsController.remove);

  return router;
}