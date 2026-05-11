import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { vehiclesController } from './vehicles.controller';

export function vehiclesRouter(): Router {
  const router = Router();

  router.use(authMiddleware); // todas as rotas de vehicles exigem autenticação

  router.get('/', vehiclesController.list);
  router.get('/user/:userId', vehiclesController.listByUser); // antes de /:id
  router.get('/:id', vehiclesController.getById);
  router.post('/', vehiclesController.create);
  router.patch('/:id', vehiclesController.update);
  router.delete('/:id', vehiclesController.remove);

  return router;
}