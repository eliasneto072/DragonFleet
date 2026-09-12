import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { balanceController } from './balance.controller';

export function balanceRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  // Dono ou admin/manager (validado no service)
  router.get('/:userId', balanceController.getSummary);
  router.get('/:userId/adjustments', balanceController.listAdjustments);

  // O extrato. Mesma regra de acesso do resumo — o dono ou a gestao — e a
  // guarda vem do proprio getSummary que o servico chama, para nao haver duas
  // definicoes da mesma permissao.
  router.get('/:userId/ledger', balanceController.getLedger);

  // Só admin/manager (validado no service)
  router.post('/:userId/adjustments', balanceController.createAdjustment);

  return router;
}