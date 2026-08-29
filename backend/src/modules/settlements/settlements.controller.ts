// src/modules/settlements/settlements.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { settlementsService } from './settlements.service';
import {
  settlementIdParamSchema,
  listSettlementsSchema,
  createSettlementSchema,
  updateSettlementSchema,
  previewSettlementSchema,
  cancelSettlementSchema,
} from './settlements.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class SettlementsController {
  // GET /settlements?userId=&status=&from=&to=
  list = async (req: AuthRequest, res: Response) => {
    const parsed = listSettlementsSchema.parse({ query: req.query });
    const { items, page, totals } = await settlementsService.list(getActor(req), parsed.query);

    // `settlements` mantém o nome de sempre: o que muda é passar a ser uma
    // página. `page` diz quantas há ao todo e `totals` traz as somas do filtro
    // inteiro, que a tela mostrava somando tudo no browser.
    return ok(res, { settlements: items, page, totals });
  };

  // GET /settlements/:id
  getById = async (req: AuthRequest, res: Response) => {
    const parsed = settlementIdParamSchema.parse({ params: req.params });
    const settlement = await settlementsService.getById(getActor(req), parsed.params.id);
    return ok(res, { settlement });
  };

  // POST /settlements — cria rascunho, nada é creditado
  create = async (req: AuthRequest, res: Response) => {
    const parsed = createSettlementSchema.parse({ body: req.body });
    const settlement = await settlementsService.create(getActor(req), parsed.body);
    return ok(res, { settlement }, 201);
  };

  // POST /settlements/preview — calcula sem gravar
  preview = async (req: AuthRequest, res: Response) => {
    const parsed = previewSettlementSchema.parse({ body: req.body });
    const totals = await settlementsService.preview(getActor(req), parsed.body);
    return ok(res, { totals });
  };

  // PATCH /settlements/:id — só rascunhos
  update = async (req: AuthRequest, res: Response) => {
    const parsed = updateSettlementSchema.parse({ params: req.params, body: req.body });
    const settlement = await settlementsService.update(
      getActor(req), parsed.params.id, parsed.body,
    );
    return ok(res, { settlement });
  };

  // POST /settlements/:id/register — credita o motorista
  register = async (req: AuthRequest, res: Response) => {
    const parsed = settlementIdParamSchema.parse({ params: req.params });
    const settlement = await settlementsService.register(getActor(req), parsed.params.id);
    return ok(res, { settlement });
  };

  // POST /settlements/:id/cancel — reverte o crédito
  cancel = async (req: AuthRequest, res: Response) => {
    const parsed = cancelSettlementSchema.parse({ params: req.params, body: req.body ?? {} });
    const settlement = await settlementsService.cancel(
      getActor(req), parsed.params.id, parsed.body.reason,
    );
    return ok(res, { settlement });
  };

  // DELETE /settlements/:id — só rascunhos
  remove = async (req: AuthRequest, res: Response) => {
    const parsed = settlementIdParamSchema.parse({ params: req.params });
    await settlementsService.remove(getActor(req), parsed.params.id);
    return res.status(204).send();
  };
}

export const settlementsController = new SettlementsController();
