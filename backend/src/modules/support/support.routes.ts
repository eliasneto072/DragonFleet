// src/modules/support/support.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { supportController } from './support.controller';

export function supportRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/',                       supportController.list);
  router.get('/:id',                    supportController.getById);
  router.post('/',                      supportController.create);
  router.patch('/:id/status',           supportController.updateStatus);
  router.post('/:id/replies',           supportController.addReply);

  return router;
}