import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { analyticsService } from './analytics.service';
import { fleetStatsService } from './fleet-stats.service';

/**
 * "2026-09-01" → Date, ou undefined.
 *
 * Uma data que o browser mandou mal escrita dava `Invalid Date`, que atravessa
 * silenciosamente até ao SQL e traz zero linhas — e o ecrã mostrava uma frota
 * vazia sem dizer porquê. Aqui vira "sem filtro", que é o comportamento certo
 * para um parâmetro opcional.
 */
function dataOuNada(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

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

  // GET /analytics/overview — fila de trabalho e posição financeira do painel.
  getOverview = async (req: AuthRequest, res: Response) => {
    const overview = await analyticsService.getOverview(getActor(req));
    return ok(res, { overview });
  };

  // GET /analytics/fleet?from=2026-01-01&to=2026-12-31
  // Sem datas, o service assume o ano civil corrente.
  getFleet = async (req: AuthRequest, res: Response) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const fleet = await fleetStatsService.get(getActor(req), {
      from: dataOuNada(from),
      to: dataOuNada(to),
    });
    return ok(res, { fleet });
  };
}

export const analyticsController = new AnalyticsController();
