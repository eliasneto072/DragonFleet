// src/modules/bank/bank.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { upload } from '../../middlewares/upload.middleware';
import { bankController } from './bank.controller';

export function bankRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  // Antes de '/:userId': "me", "pending" e "accounts" seriam lidos como
  // identificadores de utilizador.
  router.get('/me', bankController.getMine);
  router.get('/pending', bankController.listPending);

  // O comprovativo vem no mesmo pedido: separar permitiria gravar um IBAN sem
  // prova, que é o que a aprovação existe para impedir.
  router.post('/', upload.single('proof'), bankController.submit);

  // As operações sobre UMA conta. Por id e não por utilizador: com três contas
  // por pessoa, "a conta do motorista X" deixou de identificar alguma coisa.
  router.patch('/accounts/:id/review', bankController.review);
  router.patch('/accounts/:id/primary', bankController.setPrimary);
  router.patch('/accounts/:id', bankController.rename);
  router.delete('/accounts/:id', bankController.archive);

  router.get('/:userId', bankController.getByUser);

  return router;
}
