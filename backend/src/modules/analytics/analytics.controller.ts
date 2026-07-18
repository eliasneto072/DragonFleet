import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { analyticsService } from './analytics.service';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class AnalyticsController {
  getStats = async (req: AuthRequest, res: Response) => {
    const stats = await analyticsService.getStats(getActor(req));
    return ok(res, { stats });
  };
}

export const analyticsController = new AnalyticsController();