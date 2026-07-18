import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { withdrawalsService } from './withdrawals.service';
import {
  createWithdrawalSchema,
  updateWithdrawalStatusSchema,
  withdrawalIdParamSchema,
  userIdParamSchema,
} from './withdrawals.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) {
    throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  }

  return { id: req.user.id, role: req.user.role };
}

export class WithdrawalsController {
  list = async (req: AuthRequest, res: Response) => {
    const withdrawals = await withdrawalsService.list(getActor(req));
    return ok(res, { withdrawals });
  };

  listByUser = async (req: AuthRequest, res: Response) => {
    const parsed = userIdParamSchema.parse({ params: req.params });
    const withdrawals = await withdrawalsService.listByUser(getActor(req), parsed.params.userId);
    return ok(res, { withdrawals });
  };

  getById = async (req: AuthRequest, res: Response) => {
    const parsed = withdrawalIdParamSchema.parse({ params: req.params });
    const withdrawal = await withdrawalsService.getById(getActor(req), parsed.params.id);
    return ok(res, { withdrawal });
  };

  create = async (req: AuthRequest, res: Response) => {
    const parsed = createWithdrawalSchema.parse({ body: req.body });
    const actor = getActor(req);

    const withdrawal = await withdrawalsService.create(actor, actor.id, parsed.body);

    return ok(res, { withdrawal }, 201);
  };

  updateStatus = async (req: AuthRequest, res: Response) => {
    const parsed = updateWithdrawalStatusSchema.parse({
      params: req.params,
      body: req.body,
    });

    const withdrawal = await withdrawalsService.updateStatus(
      getActor(req),
      parsed.params.id,
      parsed.body
    );

    return ok(res, { withdrawal });
  };

  remove = async (req: AuthRequest, res: Response) => {
    const parsed = withdrawalIdParamSchema.parse({ params: req.params });
    await withdrawalsService.remove(getActor(req), parsed.params.id);
    return res.status(204).send();
  };
}

export const withdrawalsController = new WithdrawalsController();