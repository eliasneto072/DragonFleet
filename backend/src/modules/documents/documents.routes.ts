import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { documentsController } from './documents.controller';


export function documentsRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', authMiddleware, documentsController.list);
  router.get('/:id', authMiddleware, documentsController.getById);
  router.post('/', authMiddleware, documentsController.create);
  router.patch('/:id', authMiddleware, documentsController.update);

  // rota específica para status (mais seguro e claro)
  router.patch('/:id/status', authMiddleware, documentsController.updateStatus);

  router.delete('/:id', authMiddleware, documentsController.remove);

  return router;
}