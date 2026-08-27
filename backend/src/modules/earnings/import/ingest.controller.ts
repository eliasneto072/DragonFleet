// src/modules/earnings/import/ingest.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../../middlewares/auth.middleware';
import { ok } from '../../../shared/http/response';
import { AppError } from '../../../shared/errors/AppError';
import { ingestService } from './ingest.service';
import { ingestSchema } from './ingest.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class IngestController {
  // POST /earnings/ingest/preview — simula sem gravar.
  preview = async (req: AuthRequest, res: Response) => {
    const parsed = ingestSchema.parse({ body: req.body });
    const result = await ingestService.preview(getActor(req), parsed.body);
    return ok(res, { result });
  };

  // POST /earnings/ingest — grava.
  ingest = async (req: AuthRequest, res: Response) => {
    const parsed = ingestSchema.parse({ body: req.body });
    const result = await ingestService.ingest(getActor(req), parsed.body);
    return ok(res, { result }, 201);
  };
}

export const ingestController = new IngestController();
