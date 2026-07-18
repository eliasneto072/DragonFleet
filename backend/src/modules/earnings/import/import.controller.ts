// src/modules/earnings/import/import.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../../middlewares/auth.middleware';
import { ok } from '../../../shared/http/response';
import { AppError } from '../../../shared/errors/AppError';
import { EarningPlatform } from '../../../shared/types/enums';
import { earningsImportService } from './import.service';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

function getCsv(req: AuthRequest): string {
  // multer memoryStorage → req.file.buffer
  const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
  if (!file) throw new AppError('Nenhum arquivo enviado.', 400, 'NO_FILE');
  return file.buffer.toString('utf-8');
}

function getFallback(req: AuthRequest): EarningPlatform | undefined {
  const raw = (req.body?.platform ?? req.query?.platform) as string | undefined;
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (upper in EarningPlatform) return EarningPlatform[upper as keyof typeof EarningPlatform];
  return undefined;
}

export class EarningsImportController {
  // POST /earnings/import/preview   (multipart: file, platform?)
  preview = async (req: AuthRequest, res: Response) => {
    getActor(req);
    const csv = getCsv(req);
    const result = earningsImportService.preview(csv, getFallback(req));
    return ok(res, {
      rowCount: result.rows.length,
      totalAmount: result.totalAmount,
      detectedPlatform: result.detectedPlatform,
      errors: result.errors.slice(0, 20),
      sample: result.rows.slice(0, 5),
    });
  };

  // POST /earnings/import          (multipart: file, platform?)
  commit = async (req: AuthRequest, res: Response) => {
    const actor = getActor(req);
    const csv = getCsv(req);
    const summary = await earningsImportService.commit(actor.id, csv, getFallback(req));
    return ok(res, { summary }, 201);
  };
}

export const earningsImportController = new EarningsImportController();
