// src/modules/settlements/pedidos.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { uploadToCloudinary } from '../upload/upload.service';
import { pedidosService } from './pedidos.service';
import {
  criarPedidoSchema, fechoIdParamSchema, listarPedidosSchema,
  pedidoIdParamSchema, responderPedidoSchema,
} from './pedidos.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class PedidosController {
  // GET /settlements/pedidos?status=ABERTO — a fila da gestão
  listar = async (req: AuthRequest, res: Response) => {
    const parsed = listarPedidosSchema.parse({ query: req.query });
    return ok(res, await pedidosService.listar(getActor(req), parsed.query));
  };

  // GET /settlements/pedidos/meus — os do próprio motorista
  meus = async (req: AuthRequest, res: Response) => {
    return ok(res, await pedidosService.meus(getActor(req)));
  };

  // GET /settlements/:id/pedidos
  doFecho = async (req: AuthRequest, res: Response) => {
    const parsed = fechoIdParamSchema.parse({ params: req.params });
    return ok(res, await pedidosService.doFecho(getActor(req), parsed.params.id));
  };

  // POST /settlements/:id/pedidos
  criar = async (req: AuthRequest, res: Response) => {
    const parsed = criarPedidoSchema.parse({ params: req.params, body: req.body });
    const pedido = await pedidosService.criar(
      getActor(req), parsed.params.id, parsed.body,
    );
    return ok(res, { pedido }, 201);
  };

  /**
   * POST /settlements/pedidos/:pedidoId/responder — multipart.
   *
   * O extrato vai no MESMO pedido que o texto, como no comprovativo do IBAN.
   * Em dois passos — enviar o ficheiro, depois gravar a resposta — qualquer
   * falha pelo meio deixava um ficheiro no Cloudinary que nada referencia, ou
   * uma resposta a apontar para um ficheiro que não chegou a subir.
   *
   * O ficheiro é OPCIONAL: há dúvidas que se esclarecem com uma frase. Que não
   * se pode é mandar as duas coisas vazias — a regra está em `respostaCompleta`.
   */
  responder = async (req: AuthRequest, res: Response) => {
    const parsed = responderPedidoSchema.parse({ params: req.params, body: req.body });

    let fileUrl = parsed.body.fileUrl ?? null;
    let fileKey = parsed.body.fileKey ?? null;

    if (req.file) {
      const subido = await uploadToCloudinary(
        req.file.buffer, req.file.mimetype, 'extratos-de-fecho',
      );
      fileUrl = subido.fileUrl;
      fileKey = subido.fileKey;
    }

    const pedido = await pedidosService.responder(
      getActor(req), parsed.params.pedidoId,
      { answer: parsed.body.answer, fileUrl, fileKey },
    );
    return ok(res, { pedido });
  };

  // DELETE /settlements/pedidos/:pedidoId
  retirar = async (req: AuthRequest, res: Response) => {
    const parsed = pedidoIdParamSchema.parse({ params: req.params });
    await pedidosService.retirar(getActor(req), parsed.params.pedidoId);
    return ok(res, { ok: true });
  };
}

export const pedidosController = new PedidosController();
