// src/modules/plan-requests/meu-plano.routes.ts
//
// O plano desta frota, do ponto de vista do cliente.
//
// ─── DUAS COISAS NESTE FICHEIRO QUE PARECEM ERRO E NÃO SÃO ──────────────────
//
// 1. `requireAdmin` e não uma área. Isto não é uma área do painel — é a conta
//    da empresa. Quem decide mudar de plano é quem paga, e dentro de uma frota
//    isso é o administrador dela. Um gestor de faturação a ver preços não
//    acrescenta nada e pode dar uma conversa interna que não é dele.
//
// 2. Montado ACIMA do bloqueio de escrita da assinatura expirada (ver
//    `routes.ts`). É de propósito e é o ponto todo: uma frota expirada é
//    precisamente quem precisa de poder pedir. Fechar esta porta a quem está
//    trancado era fechar a porta de quem quer pagar.

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/role.middleware';
import { meuPlanoController as c } from './meu-plano.controller';

export function meuPlanoRouter(): Router {
  const router = Router();

  router.use(authMiddleware);
  router.use(requireAdmin);

  router.get('/', c.ver);
  router.post('/pedido', c.pedir);
  router.delete('/pedido/:id', c.cancelar);

  return router;
}
