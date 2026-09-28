// src/modules/expenses/expenses.controller.ts
import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { expensesService } from './expenses.service';
import {
  ingestExpensesSchema, forSettlementSchema, updateMovementSchema,
  listCardsSchema, saveCardSchema, cardIdSchema,
} from './expenses.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Não autenticado', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export const expensesController = {
  preview: async (req: AuthRequest, res: Response) => {
    const { body } = ingestExpensesSchema.parse({ body: req.body });
    return ok(res, await expensesService.preview(getActor(req), body.source, body.rows));
  },

  ingest: async (req: AuthRequest, res: Response) => {
    const { body } = ingestExpensesSchema.parse({ body: req.body });
    return ok(res, await expensesService.ingest(getActor(req), body.source, body.rows), 201);
  },

  forSettlement: async (req: AuthRequest, res: Response) => {
    const { query } = forSettlementSchema.parse({ query: req.query });
    return ok(res, await expensesService.forSettlement(getActor(req), query.userId, query.weekStart));
  },

  unmatched: async (req: AuthRequest, res: Response) => {
    return ok(res, { movements: await expensesService.unmatched(getActor(req)) });
  },

  update: async (req: AuthRequest, res: Response) => {
    const { params, body } = updateMovementSchema.parse({ params: req.params, body: req.body });
    return ok(res, { movement: await expensesService.update(getActor(req), params.id, body) });
  },

  listCards: async (req: AuthRequest, res: Response) => {
    const { query } = listCardsSchema.parse({ query: req.query });
    return ok(res, { cards: await expensesService.listCards(getActor(req), query) });
  },

  saveCard: async (req: AuthRequest, res: Response) => {
    const { params, body } = saveCardSchema.parse({ params: req.params, body: req.body });
    const card = await expensesService.saveCard(getActor(req), { ...body, id: params.id });
    return ok(res, { card }, params.id ? 200 : 201);
  },

  deleteCard: async (req: AuthRequest, res: Response) => {
    const { params } = cardIdSchema.parse({ params: req.params });
    await expensesService.deleteCard(getActor(req), params.id);
    return res.status(204).send();
  },
};
