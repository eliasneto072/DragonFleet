// src/modules/plan-requests/meu-plano.controller.ts

import type { Response } from 'express';
import { z } from 'zod';
import type { PedidoComFrota } from '../../middlewares/escopo.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { meuPlanoService } from './meu-plano.service';

const pedirSchema = z.object({
  body: z.object({
    // `null` é uma escolha: quer dizer "nenhum destes, quero falar". Daí
    // `.nullable()` e não só `.optional()`.
    planoId: z.string().min(1).optional().nullable(),
    mensagem: z.string().trim().max(2000).optional().nullable(),
  }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

function getFrota(req: PedidoComFrota) {
  if (!req.frota) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return req.frota;
}

export class MeuPlanoController {
  ver = async (req: PedidoComFrota, res: Response) => {
    return ok(res, await meuPlanoService.ver(getFrota(req).fleetId));
  };

  pedir = async (req: PedidoComFrota, res: Response) => {
    const { body } = pedirSchema.parse({ body: req.body });
    getFrota(req);
    if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');

    const r = await meuPlanoService.pedir(req.user.id, body);
    return ok(res, r, r.actualizado ? 200 : 201);
  };

  cancelar = async (req: PedidoComFrota, res: Response) => {
    const { params } = idParamSchema.parse({ params: req.params });
    return ok(res, await meuPlanoService.cancelar(params.id));
  };
}

export const meuPlanoController = new MeuPlanoController();
