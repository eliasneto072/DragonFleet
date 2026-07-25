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
  // GET /analytics/stats?from=2026-06-01&to=2026-06-30
  // Sem datas, o service assume os últimos 30 dias.
  getStats = async (req: AuthRequest, res: Response) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const stats = await analyticsService.getStats(getActor(req), { from, to });
    return ok(res, { stats });
  };
}

export const analyticsController = new AnalyticsController();
