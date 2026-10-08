// src/modules/reminders/reminders.routes.ts

import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middlewares/auth.middleware';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { remindersService } from './reminders.service';

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD');

function actor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export function remindersRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/', async (req: AuthRequest, res: Response) => {
    const todos = req.query.all === 'true';
    return ok(res, { reminders: await remindersService.list(actor(req), todos) });
  });

  router.post('/', async (req: AuthRequest, res: Response) => {
    const corpo = z.object({
      title: z.string().trim().min(1, 'Escreva o lembrete').max(200),
      notes: z.string().trim().max(2000).optional().nullable(),
      // Sem data, é para hoje — ver o serviço.
      dueOn: dia.optional(),
    }).parse(req.body);
    return ok(res, { reminder: await remindersService.create(actor(req), corpo) }, 201);
  });

  router.patch('/:id', async (req: AuthRequest, res: Response) => {
    const { done } = z.object({ done: z.boolean() }).parse(req.body);
    return ok(res, { reminder: await remindersService.setDone(actor(req), req.params.id, done) });
  });

  router.delete('/:id', async (req: AuthRequest, res: Response) => {
    await remindersService.remove(actor(req), req.params.id);
    return ok(res, { deleted: true });
  });

  return router;
}
