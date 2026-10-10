// src/modules/auth/auth.routes.ts
import { Router }         from 'express';
import { authController } from './auth.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { invitesController } from '../invites/invites.controller';

export function authRouter() {
  const router = Router();

  // ─── A página do convite ──────────────────────────────────────────────────
  //
  // Vive aqui e não no router dos convites porque este é o único aberto a quem
  // não tem sessão — e quem abre um convite não tem conta nenhuma ainda. É a
  // mesma razão por que o login está aqui.
  //
  // Devolve o nome da frota e mais nada: quem se inscreve tem de ver em que
  // empresa está a entrar antes de escrever a palavra-passe, e um código
  // inventado por alguém não deve ser uma janela para dentro.
  router.get('/convite/:code', invitesController.resolve);

  router.post('/login',   authController.login);
  router.post('/refresh', authController.refresh);  // ← novo
  router.post('/logout',  authMiddleware, authController.logout);
  router.get('/me',       authMiddleware, authController.me);

  return router;
}