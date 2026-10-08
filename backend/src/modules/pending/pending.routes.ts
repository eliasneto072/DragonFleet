// src/modules/pending/pending.routes.ts
//
// Uma rota só, sob a área do painel: quem vê o painel pode saber o que falta
// fazer. O que ele vê de cada área é filtrado pelas permissões dele, dentro do
// serviço — esta rota não é a guarda fina.

import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { pendingService } from './pending.service';

export function pendingRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/', async (req: AuthRequest, res: Response) => {
    if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
    const pending = await pendingService.summary({ id: req.user.id, role: req.user.role });
    return ok(res, { pending });
  });

  return router;
}
