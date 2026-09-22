// src/modules/ranks/ranks.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/role.middleware';
import { ranksController as c } from './ranks.controller';

export function ranksRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  // A escada é pública para quem tem sessão: o motorista precisa de saber o
  // que lhe falta para o nível seguinte.
  router.get('/configs', c.configs);
  router.patch('/configs/:tier', requireAdmin, c.updateConfig);

  router.get('/me', c.me);
  router.get('/overview', c.overview);
  router.get('/user/:userId', c.forUser);
  router.get('/user/:userId/events', c.events);

  return router;
}
