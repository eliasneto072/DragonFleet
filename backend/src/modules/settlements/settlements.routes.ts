// src/modules/settlements/settlements.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { settlementsController } from './settlements.controller';
import { requireArea } from '../../middlewares/area.middleware';

export function settlementsRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  // A restrição de papel é validada no service, não por middleware.
  //
  // Leitura é mista de propósito: o motorista lista os próprios fechos e a
  // gestão lista todos. Um requireAdmin na rota impediria o motorista de ver
  // os dele, que é metade do que o cliente pediu.
  router.get('/', settlementsController.list);
  router.get('/:id', settlementsController.getById);

  // Escrita — apenas ADMIN ou MANAGER, garantido em settlementsService.
  router.post('/preview', settlementsController.preview);

  // Rascunhos da semana, a partir do que a extensão importou. Criar é uma
  // escrita em lote: pede a Faturação em MANAGE, como a importação das
  // despesas. A pré-visualização só lê.
  router.post('/drafts/preview', settlementsController.draftsPreview);
  router.post('/drafts', requireArea('SETTLEMENTS', 'MANAGE'), settlementsController.generateDrafts);
  router.post('/', settlementsController.create);
  router.patch('/:id', settlementsController.update);
  router.post('/:id/register', settlementsController.register);
  router.post('/:id/cancel', settlementsController.cancel);
  router.delete('/:id', settlementsController.remove);

  return router;
}
