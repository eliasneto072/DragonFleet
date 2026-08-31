import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { earningsService } from './earnings.service';
import {
  createEarningSchema,
  updateEarningSchema,
  reviewEarningSchema,
  listEarningsSchema,
  reportedRangeSchema,
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
  // GET /earnings?userId=&status=&from=&to=
  list = async (req: AuthRequest, res: Response) => {
    const parsed = listEarningsSchema.parse({ query: req.query });
    const earnings = await earningsService.list(getActor(req), parsed.query);
    return ok(res, { earnings });
  };

  // GET /earnings/reported?userId=&from=&to=
  // Conferência cruzada do fecho semanal.
  reported = async (req: AuthRequest, res: Response) => {
    const parsed = reportedRangeSchema.parse({ query: req.query });
    const reported = await earningsService.reportedInRange(
      getActor(req),
      parsed.query.userId,
      parsed.query.from,
      parsed.query.to,
    );
    return ok(res, { reported });
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
      notes: parsed.body.notes,
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

  // PATCH /earnings/:id/review — aprovar ou recusar
  review = async (req: AuthRequest, res: Response) => {
    const parsed = reviewEarningSchema.parse({
      params: req.params,
      body: req.body,
    });

    const earning = await earningsService.review(
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
