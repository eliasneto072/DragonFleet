// src/modules/invites/invites.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { invitesService } from './invites.service';
import { VALIDADES } from './convite';
import { idParamSchema, codeParamSchema, criarConviteSchema } from './invites.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class InvitesController {
  list = async (_req: AuthRequest, res: Response) => {
    return ok(res, {
      convites: await invitesService.listar(),
      // As sugestões de validade vêm do servidor para não haver duas listas:
      // a do ecrã e a que o servidor aceita.
      validades: VALIDADES,
    });
  };

  create = async (req: AuthRequest, res: Response) => {
    const { body } = criarConviteSchema.parse({ body: req.body });
    const convite = await invitesService.criar(getActor(req), body);
    return ok(res, { convite }, 201);
  };

  revoke = async (req: AuthRequest, res: Response) => {
    const { params } = idParamSchema.parse({ params: req.params });
    await invitesService.revogar(getActor(req), params.id);
    return ok(res, { ok: true });
  };

  /**
   * A rota PÚBLICA: o que mostrar a quem abriu o link.
   *
   * Responde sempre 200, mesmo para um convite que não vale. O estado vai no
   * corpo porque é informação e não erro — e porque uma sucessão de 404s nesta
   * rota é a forma mais cómoda de alguém ir à pesca de códigos válidos.
   */
  resolve = async (req: AuthRequest, res: Response) => {
    const { params } = codeParamSchema.parse({ params: req.params });
    return ok(res, await invitesService.resolver(params.code));
  };
}

export const invitesController = new InvitesController();
