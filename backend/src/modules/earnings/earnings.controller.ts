import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { earningsService } from './earnings.service';
import {
  createEarningSchema,
  updateEarningSchema,
  earningIdParamSchema,
  userIdParamSchema,
} from './earnings.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) {
    throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  }

  return { id: req.user.id, role: req.user.role };
}

export class EarningsController {
  list = async (req: AuthRequest, res: Response) => {
    const earnings = await earningsService.list(getActor(req));
    return ok(res, { earnings });
  };

  listByUser = async (req: AuthRequest, res: Response) => {
    const parsed = userIdParamSchema.parse({ params: req.params });
    const earnings = await earningsService.listByUser(getActor(req), parsed.params.userId);
    return ok(res, { earnings });
  };

  getById = async (req: AuthRequest, res: Response) => {
    const parsed = earningIdParamSchema.parse({ params: req.params });
    const earning = await earningsService.getById(getActor(req), parsed.params.id);
    return ok(res, { earning });
  };

  create = async (req: AuthRequest, res: Response) => {
    const parsed = createEarningSchema.parse({ body: req.body });
    const actor = getActor(req);

    // userId vem do token — admin pode sobrescrever passando userId no body
    const userId = parsed.body.userId ?? actor.id;

    const earning = await earningsService.create(actor, userId, {
      amount: parsed.body.amount,
      date: parsed.body.date,
      platform: parsed.body.platform,
    });

    return ok(res, { earning }, 201);
  };

  update = async (req: AuthRequest, res: Response) => {
    const parsed = updateEarningSchema.parse({
      params: req.params,
      body: req.body,
    });

    const earning = await earningsService.update(
      getActor(req),
      parsed.params.id,
      parsed.body
    );

    return ok(res, { earning });
  };

  remove = async (req: AuthRequest, res: Response) => {
    const parsed = earningIdParamSchema.parse({ params: req.params });
    await earningsService.remove(getActor(req), parsed.params.id);
    return res.status(204).send();
  };
}

export const earningsController = new EarningsController();