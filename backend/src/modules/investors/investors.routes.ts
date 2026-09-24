// src/modules/investors/investors.routes.ts
//
// Duas famílias na mesma árvore:
//
//   /investors/me, /statement, /withdrawals …   o portal do investidor
//   /investors/accounts…                        a administração
//
// As permissões finas vivem no serviço (quem vê a conta de quem). Aqui só o
// `requireAdmin` nas rotas que mexem em dinheiro, para um pedido sem permissão
// ser recusado antes de o corpo ser sequer validado.

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/role.middleware';
import { investorsController as c } from './investors.controller';
import { projectsRouter } from '../projects/projects.routes';
import { requireArea } from '../../middlewares/area.middleware';

export function investorsRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  // Os projetos vivem DENTRO do portal do investidor: são um produto de
  // investimento e têm de ser alcançáveis por uma conta INVESTOR, que está
  // fechada a tudo o resto da API (ver deny-investor.middleware.ts).
  // Os projetos ANTES da guarda de INVESTIDORES: são duas áreas distintas no
  // painel, e quem trata dos projetos não tem obrigatoriamente de ver as
  // contas dos investidores. Guardá-los por baixo da outra juntaria as duas.
  router.use('/projects', requireArea('PROJECTS'), projectsRouter());

  // Daqui para baixo é a área INVESTIDORES. A guarda só constrange quem é da
  // equipa — o próprio investidor passa em frente e vê a conta dele.
  router.use(requireArea('INVESTORS'));

  // ── Portal do investidor ────────────────────────────────────────────────
  router.get('/me', c.me);
  router.get('/statement', c.statement);
  router.get('/monthly', c.monthly);
  router.get('/notifications', c.notifications);
  router.patch('/notifications/:id/read', c.readNotification);
  router.get('/withdrawals', c.myWithdrawals);
  router.post('/withdrawals', c.requestWithdrawal);
  router.delete('/withdrawals/:id', c.cancelWithdrawal);

  // ── Administração ───────────────────────────────────────────────────────
  // Antes de '/accounts/:id' por legibilidade — o Express já dá prioridade ao
  // segmento estático, mas quem lê não tem de saber isso.
  router.get('/overview', c.overview);
  router.get('/stats', c.stats);
  router.get('/pending-withdrawals', c.pendingWithdrawals);
  router.patch('/withdrawals/:id/decide', requireAdmin, c.decideWithdrawal);

  router.get('/accounts', c.listAccounts);
  router.post('/accounts', requireAdmin, c.create);
  router.get('/accounts/:id', c.getAccount);
  router.patch('/accounts/:id', requireAdmin, c.updateAccount);
  router.post('/accounts/:id/deposits', requireAdmin, c.deposit);
  router.post('/accounts/:id/adjustments', requireAdmin, c.adjust);
  router.post('/accounts/:id/rates', requireAdmin, c.setRate);

  return router;
}
