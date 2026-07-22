import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { balanceService } from './balance.service';
import { balanceUserParamSchema, createAdjustmentSchema } from './balance.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) {
    throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  }
  return { id: req.user.id, role: req.user.role };
}

export class BalanceController {
  getSummary = async (req: AuthRequest, res: Response) => {
    const parsed = balanceUserParamSchema.parse({ params: req.params });
    const balance = await balanceService.getSummary(getActor(req), parsed.params.userId);
    return ok(res, { balance });
  };

  listAdjustments = async (req: AuthRequest, res: Response) => {
    const parsed = balanceUserParamSchema.parse({ params: req.params });
    const adjustments = await balanceService.listAdjustments(getActor(req), parsed.params.userId);
    return ok(res, { adjustments });
  };

  createAdjustment = async (req: AuthRequest, res: Response) => {
    const parsed = createAdjustmentSchema.parse({ params: req.params, body: req.body });
    const adjustment = await balanceService.createAdjustment(
      getActor(req),
      parsed.params.userId,
      parsed.body,
    );
    return ok(res, { adjustment }, 201);
  };
}

export const balanceController = new BalanceController();