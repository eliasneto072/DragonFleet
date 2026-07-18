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
}

export const reportsController = new ReportsController();
