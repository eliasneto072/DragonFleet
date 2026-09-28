// src/modules/permissions/permissions.routes.ts
//
// O catálogo e as minhas próprias permissões estão abertos a quem tem sessão:
// são a lista de menus que existem e o que eu próprio posso. Tudo o que toca
// nas permissões DE OUTRA PESSOA exige ADMIN, verificado outra vez no serviço.

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/role.middleware';
import { permissionsController as c } from './permissions.controller';

export function permissionsRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/catalog', c.catalog);
  router.get('/mine', c.mine);

  router.get('/staff', requireAdmin, c.listStaff);
  router.get('/:userId', requireAdmin, c.get);
  router.put('/:userId', requireAdmin, c.set);
  router.delete('/:userId', requireAdmin, c.reset);

  return router;
}
