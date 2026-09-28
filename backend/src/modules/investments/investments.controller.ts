// src/modules/investments/investments.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { investmentsService } from './investments.service';
import {
  createPlanSchema, idParamSchema, overviewQuerySchema, setRateSchema, subscribeSchema,
  updatePlanSchema, userIdParamSchema,
} from './investments.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class InvestmentsController {
  // ── Planos ──
  listPlans = async (req: AuthRequest, res: Response) => {
    const plans = await investmentsService.listPlans(getActor(req), {
      includeInactive: req.query.all === '1',
    });
    return ok(res, { plans });
  };

  createPlan = async (req: AuthRequest, res: Response) => {
    const { body } = createPlanSchema.parse({ body: req.body });
    const plan = await investmentsService.createPlan(getActor(req), body);
    return ok(res, { plan }, 201);
  };

  updatePlan = async (req: AuthRequest, res: Response) => {
    const { params, body } = updatePlanSchema.parse({ params: req.params, body: req.body });
    const plan = await investmentsService.updatePlan(getActor(req), params.id, body);
    return ok(res, { plan });
  };

  setRate = async (req: AuthRequest, res: Response) => {
    const { params, body } = setRateSchema.parse({ params: req.params, body: req.body });
    const rates = await investmentsService.setRate(getActor(req), params.id, body);
    return ok(res, { rates });
  };

  rateHistory = async (req: AuthRequest, res: Response) => {
    const { params } = idParamSchema.parse({ params: req.params });
    const rates = await investmentsService.getRateHistory(getActor(req), params.id);
    return ok(res, { rates });
  };

  // ── Aplicações ──
  mine = async (req: AuthRequest, res: Response) => {
    const actor = getActor(req);
    return ok(res, await investmentsService.listForUser(actor, actor.id));
  };

  forUser = async (req: AuthRequest, res: Response) => {
    const { params } = userIdParamSchema.parse({ params: req.params });
    return ok(res, await investmentsService.listForUser(getActor(req), params.userId));
  };

  overview = async (req: AuthRequest, res: Response) => {
    const { query } = overviewQuerySchema.parse({ query: req.query });
    return ok(res, await investmentsService.adminOverview(getActor(req), query));
  };

  subscribe = async (req: AuthRequest, res: Response) => {
    const { body } = subscribeSchema.parse({ body: req.body });
    const investment = await investmentsService.subscribe(getActor(req), body);
    return ok(res, { investment }, 201);
  };

  detail = async (req: AuthRequest, res: Response) => {
    const { params } = idParamSchema.parse({ params: req.params });
    return ok(res, await investmentsService.getDetail(getActor(req), params.id));
  };

  previewWithdraw = async (req: AuthRequest, res: Response) => {
    const { params } = idParamSchema.parse({ params: req.params });
    const preview = await investmentsService.previewWithdraw(getActor(req), params.id);
    return ok(res, { preview });
  };

  withdraw = async (req: AuthRequest, res: Response) => {
    const { params } = idParamSchema.parse({ params: req.params });
    const investment = await investmentsService.withdraw(getActor(req), params.id);
    return ok(res, { investment });
  };
}

export const investmentsController = new InvestmentsController();
