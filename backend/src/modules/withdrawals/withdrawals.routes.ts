import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { upload } from '../../middlewares/upload.middleware';
import { withdrawalsController } from './withdrawals.controller';

export function withdrawalsRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', withdrawalsController.list);
  router.get('/user/:userId', withdrawalsController.listByUser);
  router.get('/:id', withdrawalsController.getById);
  // O recibo vem no mesmo pedido: separar permitiria criar retiradas sem
  // fatura, que é o que a exigência existe para impedir.
  router.post('/', upload.single('receipt'), withdrawalsController.create);
  router.patch('/:id/status', withdrawalsController.updateStatus);
  router.delete('/:id', withdrawalsController.remove);

  return router;
}