// src/modules/expenses/expenses.routes.ts
//
// Tudo da administração e gestão: o suporte não precisa dos trajetos e horas
// das portagens de ninguém para responder a um ticket — vê o total no fecho.
//
// As ESCRITAS pedem a área de Faturação em MANAGE, declarado rota a rota. A
// montagem em routes.ts só pede VER.
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireStaff } from '../../middlewares/role.middleware';
import { requireArea } from '../../middlewares/area.middleware';
import { expensesController } from './expenses.controller';

export function expensesRouter() {
  const router = Router();
  router.use(authMiddleware);
  router.use(requireStaff);

  const gerir = requireArea('SETTLEMENTS', 'MANAGE');

  router.post('/ingest/preview', expensesController.preview);
  router.post('/ingest', gerir, expensesController.ingest);
  router.get('/for-settlement', expensesController.forSettlement);
  router.get('/unmatched', expensesController.unmatched);
  router.patch('/movements/:id', gerir, expensesController.update);

  router.get('/cards', expensesController.listCards);
  router.post('/cards', gerir, expensesController.saveCard);
  router.patch('/cards/:id', gerir, expensesController.saveCard);
  router.delete('/cards/:id', gerir, expensesController.deleteCard);

  return router;
}
