// src/modules/ranks/ranks.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { ranksService } from './ranks.service';
import {
  overviewQuerySchema, updateConfigSchema, userIdParamSchema,
} from './ranks.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class RanksController {
  /** A escada toda: nomes, cores, metas e vantagens. */
  configs = async (req: AuthRequest, res: Response) => {
    return ok(res, { configs: await ranksService.listConfigs(getActor(req)) });
  };

  updateConfig = async (req: AuthRequest, res: Response) => {
    const { params, body } = updateConfigSchema.parse({ params: req.params, body: req.body });
    const config = await ranksService.updateConfig(getActor(req), params.tier, body);
    return ok(res, { config });
  };

  /** O meu nível, recalculado na hora. */
  me = async (req: AuthRequest, res: Response) => {
    const actor = getActor(req);
    return ok(res, { status: await ranksService.statusFor(actor, actor.id) });
  };

  forUser = async (req: AuthRequest, res: Response) => {
    const { params } = userIdParamSchema.parse({ params: req.params });
    return ok(res, { status: await ranksService.statusFor(getActor(req), params.userId) });
  };

  events = async (req: AuthRequest, res: Response) => {
    const { params } = userIdParamSchema.parse({ params: req.params });
    return ok(res, { events: await ranksService.events(getActor(req), params.userId) });
  };

  overview = async (req: AuthRequest, res: Response) => {
    const { query } = overviewQuerySchema.parse({ query: req.query });
    return ok(res, await ranksService.overview(getActor(req), query));
  };
}

export const ranksController = new RanksController();
