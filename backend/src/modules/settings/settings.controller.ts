// src/modules/settings/settings.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { settingsService, type SettingsInput } from './settings.service';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class SettingsController {
  // GET /settings
  get = async (req: AuthRequest, res: Response) => {
    getActor(req);
    const settings = await settingsService.get();
    return ok(res, { settings });
  };

  // PUT /settings  (admin only — enforced in the service)
  update = async (req: AuthRequest, res: Response) => {
    const actor = getActor(req);
    const settings = await settingsService.update(actor, req.body as SettingsInput);
    return ok(res, { settings });
  };
}

export const settingsController = new SettingsController();
