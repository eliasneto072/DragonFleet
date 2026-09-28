import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { balanceController } from './balance.controller';

export function balanceRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  // ANTES do '/:userId'. O Express testa as rotas pela ordem em que foram
  // declaradas, e '/adjustments/xxx' não colide com um GET '/:userId' (métodos
  // diferentes) — mas basta alguém acrescentar amanhã um GET aqui para
  // 'adjustments' passar a ser lido como o id de um utilizador. Declarar o
  // caminho literal primeiro fecha essa porta antes de ela existir.
  router.patch('/adjustments/:adjustmentId', balanceController.updateAdjustment);

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