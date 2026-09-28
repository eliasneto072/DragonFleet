// src/modules/investments/investments.routes.ts
//
// As permissões finas vivem no serviço (quem vê, quem mexe). Aqui só o
// `requireAdmin` nas rotas que mudam planos, para um pedido sem permissão ser
// recusado antes de o corpo ser sequer validado.

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/role.middleware';
import { investmentsController as c } from './investments.controller';

export function investmentsRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  // Planos
  router.get('/plans', c.listPlans);
  router.post('/plans', requireAdmin, c.createPlan);
  router.patch('/plans/:id', requireAdmin, c.updatePlan);
  router.get('/plans/:id/rates', c.rateHistory);
  router.post('/plans/:id/rates', requireAdmin, c.setRate);

  // Aplicações — rotas fixas antes das com :id
  router.get('/me', c.mine);
  router.get('/overview', c.overview);
  router.get('/user/:userId', c.forUser);
  router.post('/', c.subscribe);
  router.get('/:id', c.detail);
  router.get('/:id/withdraw-preview', c.previewWithdraw);
  router.post('/:id/withdraw', c.withdraw);

  return router;
}
