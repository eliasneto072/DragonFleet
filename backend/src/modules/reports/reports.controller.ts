// src/modules/reports/reports.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { AppError } from '../../shared/errors/AppError';
import { reportsService } from './reports.service';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class ReportsController {
  // GET /reports/financial.pdf?from=2026-01-01&to=2026-06-30
  financialPdf = async (req: AuthRequest, res: Response) => {
    const { from, to } = req.query as { from?: string; to?: string };
    await reportsService.streamFinancialReport(getActor(req), res, { from, to });
    // service handles headers + stream; nothing else to return
  };

  // GET /reports/earnings.pdf?from=2026-07-01&to=2026-07-31[&userId=...]
  //
  // Sem userId, o extrato é do próprio requisitante. Passar userId só funciona
  // para admin/manager — o service rejeita qualquer outro caso.
  earningsPdf = async (req: AuthRequest, res: Response) => {
    const actor = getActor(req);
    const { from, to, userId } = req.query as {
      from?: string; to?: string; userId?: string;
    };
    await reportsService.streamDriverEarningsReport(actor, res, {
      userId: userId || actor.id,
      from,
      to,
    });
  };
}

export const reportsController = new ReportsController();