// src/modules/invites/invites.routes.ts
//
// Os convites de uma frota. Quem convida motoristas é quem gere motoristas —
// a área está em `routes.ts`, no nível MANAGE.
//
// A rota pública que lê um convite NÃO está aqui: está no router do `auth`, que
// é o único aberto a quem não tem sessão. Ver `auth.routes.ts`.

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { invitesController as c } from './invites.controller';

export function invitesRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/', c.list);
  router.post('/', c.create);
  router.post('/:id/revogar', c.revoke);

  return router;
}
