// src/modules/projects/projects.routes.ts
//
// Montado DENTRO de /investors (ver routes/routes.ts): um projeto é um produto
// de investimento e tem de ser alcançável por uma conta de investidor, que
// está fechada a tudo o resto da API.
//
// As permissões finas vivem no serviço — quem vê que projeto, quem participa.
// Aqui só o `requireAdmin` nas rotas que mexem em dinheiro ou no ciclo de vida,
// para um pedido sem permissão ser recusado antes de o corpo ser validado.

import { Router } from 'express';
import { requireAdmin } from '../../middlewares/role.middleware';
import { projectsController as c } from './projects.controller';

export function projectsRouter(): Router {
  const router = Router();

  // Rotas fixas antes das que têm :id — senão "mine" é lido como um id.
  router.get('/mine', c.mine);
  router.get('/', c.list);
  router.post('/', requireAdmin, c.create);

  router.get('/:id', c.get);
  router.patch('/:id', requireAdmin, c.update);

  // O investidor subscreve. Sem requireAdmin de propósito: é a única rota
  // daqui que ele usa para escrever.
  router.post('/:id/subscribe', c.subscribe);

  // Ciclo de vida
  router.post('/:id/open', requireAdmin, c.openFunding);
  router.post('/:id/activate', requireAdmin, c.activate);
  router.post('/:id/cancel', requireAdmin, c.cancel);
  router.post('/:id/close', requireAdmin, c.close);

  // Meses
  router.post('/:id/periods/compute', requireAdmin, c.computePending);
  router.post('/:id/periods/:month/compute', requireAdmin, c.computeMonth);
  router.post('/:id/periods/:month/distribute', requireAdmin, c.distribute);

  // Despesas
  router.post('/:id/expenses', requireAdmin, c.addExpense);
  router.delete('/expenses/:id', requireAdmin, c.removeExpense);

  return router;
}
