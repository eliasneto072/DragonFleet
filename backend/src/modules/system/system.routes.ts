// src/modules/system/system.routes.ts
//
// O painel do dono da plataforma.
//
// Tudo aqui passa por `painelDoDono`, que faz as duas coisas de uma vez: exige
// a marca de dono e põe o pedido em modo de dono (ver `dono.middleware.ts`).
// Está num `router.use` e não rota a rota de propósito — uma rota nova deste
// módulo nasce protegida sem ninguém se lembrar de a proteger, que é a mesma
// ideia do muro dos investidores em `routes.ts`.

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { painelDoDono } from '../../middlewares/dono.middleware';
import { systemController as c } from './system.controller';

export function systemRouter(): Router {
  const router = Router();

  router.use(authMiddleware);
  router.use(painelDoDono);

  // ── Frotas ──
  router.get('/painel', c.painel);
  router.post('/frotas', c.criarFrota);
  router.patch('/frotas/:id', c.actualizarFrota);
  router.post('/frotas/:id/renovar', c.renovar);
  router.get('/frotas/:id/contas', c.contas);

  // ── Pedidos de plano ──
  router.get('/pedidos', c.pedidos);
  router.post('/pedidos/:id/fechar', c.fecharPedido);

  // ── Planos ──
  //
  // O catálogo ANTES de `/planos/:id`: sem isto, "catalogo" era apanhado como
  // um id de plano e a resposta era "plano não encontrado".
  router.get('/catalogo', c.catalogo);
  router.get('/planos', c.planos);
  router.post('/planos', c.criarPlano);
  router.patch('/planos/:id', c.actualizarPlano);
  router.post('/planos/:id/arquivar', c.arquivarPlano);

  return router;
}
