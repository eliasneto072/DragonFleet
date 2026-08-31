// src/modules/bank/bank.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { upload } from '../../middlewares/upload.middleware';
import { bankController } from './bank.controller';

export function bankRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  // Antes de '/:userId': "me" e "pending" seriam lidos como identificadores.
  router.get('/me', bankController.getMine);
  router.get('/pending', bankController.listPending);

  // O comprovativo vem no mesmo pedido: separar permitiria gravar um IBAN sem
  // prova, que é o que a aprovação existe para impedir.
  router.post('/', upload.single('proof'), bankController.submit);

  router.get('/:userId', bankController.getByUser);
  router.patch('/:userId/review', bankController.review);

  return router;
}
