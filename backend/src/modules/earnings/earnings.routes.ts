import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { earningsController } from './earnings.controller';

export function earningsRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', earningsController.list);
  router.get('/user/:userId', earningsController.listByUser);
  router.get('/:id', earningsController.getById);
  router.post('/', earningsController.create);
  router.patch('/:id', earningsController.update);
  router.delete('/:id', earningsController.remove);

  return router;
}