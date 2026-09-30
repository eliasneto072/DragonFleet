// src/modules/fleet-import/fleet-import.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { fleetImportService } from './fleet-import.service';
import { importSchema } from './fleet-import.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class FleetImportController {
  // POST /fleet-import/analisar — lê os PDFs e devolve o plano, sem gravar.
  analisar = async (req: AuthRequest, res: Response) => {
    const body = importSchema.parse(req.body);
    return ok(res, await fleetImportService.analisar(getActor(req), body));
  };

  // POST /fleet-import — o mesmo, e cria os rascunhos.
  importar = async (req: AuthRequest, res: Response) => {
    const body = importSchema.parse(req.body);
    return ok(res, await fleetImportService.importar(getActor(req), body));
  };
}

export const fleetImportController = new FleetImportController();
