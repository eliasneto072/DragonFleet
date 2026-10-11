// src/modules/system/system.controller.ts

import type { Response } from 'express';
import type { PedidoComFrota } from '../../middlewares/escopo.middleware';
import { ok } from '../../shared/http/response';
import { systemService } from './system.service';
import { leadsService } from '../leads/leads.service';
import {
  idParamSchema, criarFrotaSchema, actualizarFrotaSchema, renovarSchema,
  criarPlanoSchema, actualizarPlanoSchema, fecharPedidoSchema,
  actualizarContactoSchema,
} from './system.schemas';

export class SystemController {
  /** Os números do topo e a lista, num pedido só: é a tela inteira. */
  painel = async (_req: PedidoComFrota, res: Response) => {
    const [resumo, frotas] = await Promise.all([
      systemService.resumo(),
      systemService.listarFrotas(),
    ]);
    return ok(res, { resumo, frotas });
  };

  criarFrota = async (req: PedidoComFrota, res: Response) => {
    const { body } = criarFrotaSchema.parse({ body: req.body });
    const criada = await systemService.criarFrota(body);
    return ok(res, criada, 201);
  };

  actualizarFrota = async (req: PedidoComFrota, res: Response) => {
    const { params, body } = actualizarFrotaSchema.parse({
      params: req.params, body: req.body,
    });
    return ok(res, { frota: await systemService.actualizarFrota(params.id, body) });
  };

  renovar = async (req: PedidoComFrota, res: Response) => {
    const { params, body } = renovarSchema.parse({ params: req.params, body: req.body });
    return ok(res, { frota: await systemService.renovarFrota(params.id, body.dias) });
  };

  contas = async (req: PedidoComFrota, res: Response) => {
    const { params } = idParamSchema.parse({ params: req.params });
    return ok(res, { contas: await systemService.contasDaFrota(params.id) });
  };

  contactos = async (req: PedidoComFrota, res: Response) => {
    const todos = String((req.query as Record<string, unknown>)?.todos ?? '') === '1';
    return ok(res, { contactos: await leadsService.listar(todos) });
  };

  actualizarContacto = async (req: PedidoComFrota, res: Response) => {
    const { params, body } = actualizarContactoSchema.parse({
      params: req.params, body: req.body,
    });
    return ok(res, await leadsService.actualizar(params.id, body.estado, body.notas));
  };

  pedidos = async (req: PedidoComFrota, res: Response) => {
    // `?todos=1` traz também os fechados, para o histórico de uma conta.
    const todos = String((req.query as Record<string, unknown>)?.todos ?? '') === '1';
    return ok(res, { pedidos: await systemService.listarPedidos(todos) });
  };

  fecharPedido = async (req: PedidoComFrota, res: Response) => {
    const { params, body } = fecharPedidoSchema.parse({
      params: req.params, body: req.body,
    });
    return ok(res, await systemService.fecharPedido(params.id, body.estado, body.nota));
  };

  planos = async (_req: PedidoComFrota, res: Response) => {
    return ok(res, { planos: await systemService.listarPlanos() });
  };

  criarPlano = async (req: PedidoComFrota, res: Response) => {
    const { body } = criarPlanoSchema.parse({ body: req.body });
    return ok(res, { plano: await systemService.criarPlano(body) }, 201);
  };

  actualizarPlano = async (req: PedidoComFrota, res: Response) => {
    const { params, body } = actualizarPlanoSchema.parse({
      params: req.params, body: req.body,
    });
    return ok(res, { plano: await systemService.actualizarPlano(params.id, body) });
  };

  arquivarPlano = async (req: PedidoComFrota, res: Response) => {
    const { params } = idParamSchema.parse({ params: req.params });
    return ok(res, { plano: await systemService.arquivarPlano(params.id) });
  };

  /** As caixas do editor de planos. Ver `funcionalidades.ts`. */
  catalogo = async (_req: PedidoComFrota, res: Response) => {
    return ok(res, systemService.catalogo());
  };
}

export const systemController = new SystemController();
