// src/modules/permissions/permissions.controller.ts

import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { permissionsService } from './permissions.service';
import { AREAS, GRUPOS, NOME_DA_AREA, PERFIS } from './permissions.catalog';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

const area = z.enum(AREAS as unknown as [string, ...string[]]);
const access = z.enum(['NONE', 'VIEW', 'MANAGE']);

const setSchema = z.object({
  params: z.object({ userId: z.string().min(1) }),
  body: z.object({ grants: z.record(area, access) }),
});

const userParam = z.object({ params: z.object({ userId: z.string().min(1) }) });

export class PermissionsController {
  /**
   * O catálogo: áreas, grupos do menu e perfis prontos.
   *
   * Aberto a quem está autenticado. Não revela nada sobre ninguém — é a lista
   * de menus que existem, que qualquer pessoa da equipa vê no ecrã de
   * qualquer maneira.
   */
  catalog = async (_req: AuthRequest, res: Response) =>
    ok(res, {
      areas: AREAS.map((a) => ({ id: a, name: NOME_DA_AREA[a] })),
      groups: GRUPOS,
      profiles: PERFIS,
    });

  /** O que EU posso fazer. É isto que constrói o menu do lado do browser. */
  mine = async (req: AuthRequest, res: Response) => {
    const actor = getActor(req);
    return ok(res, { grants: await permissionsService.grantsFor(actor.id, actor.role) });
  };

  listStaff = async (req: AuthRequest, res: Response) =>
    ok(res, { staff: await permissionsService.listStaff(getActor(req)) });

  get = async (req: AuthRequest, res: Response) => {
    const { params } = userParam.parse({ params: req.params });
    return ok(res, await permissionsService.get(getActor(req), params.userId));
  };

  set = async (req: AuthRequest, res: Response) => {
    const { params, body } = setSchema.parse({ params: req.params, body: req.body });
    return ok(res, await permissionsService.set(getActor(req), params.userId, body.grants as never));
  };

  reset = async (req: AuthRequest, res: Response) => {
    const { params } = userParam.parse({ params: req.params });
    return ok(res, await permissionsService.reset(getActor(req), params.userId));
  };
}

export const permissionsController = new PermissionsController();
