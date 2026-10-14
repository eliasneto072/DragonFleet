// src/modules/company/company.controller.ts
//
// As contas da empresa, do lado do HTTP.

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { companyService as s } from './company.service';
import {
  periodoDaQuery, criarDespesaSchema, actualizarDespesaSchema,
  despesaIdSchema, categoriaIdSchema, criarCategoriaSchema, declararSaldoSchema,
} from './company.schemas';

function quem(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Sem sessão.', 401, 'UNAUTHORIZED');
  return { id: req.user.id };
}

export class CompanyController {
  lucro = async (req: AuthRequest, res: Response) =>
    ok(res, await s.lucro(periodoDaQuery(req.query)));

  caixa = async (_req: AuthRequest, res: Response) =>
    ok(res, await s.caixa());

  historicoDeCaixa = async (_req: AuthRequest, res: Response) =>
    ok(res, { historico: await s.historicoDeCaixa() });

  declararSaldo = async (req: AuthRequest, res: Response) => {
    const { body } = declararSaldoSchema.parse({ body: req.body });
    return ok(res, await s.declararSaldo(quem(req), body.saldo, body.quando, body.nota));
  };

  listarDespesas = async (req: AuthRequest, res: Response) =>
    ok(res, { despesas: await s.listarDespesas(periodoDaQuery(req.query)) });

  criarDespesa = async (req: AuthRequest, res: Response) => {
    const { body } = criarDespesaSchema.parse({ body: req.body });
    return res.status(201).json({ ok: true, data: await s.criarDespesa(quem(req), body) });
  };

  actualizarDespesa = async (req: AuthRequest, res: Response) => {
    const { params, body } = actualizarDespesaSchema.parse({ params: req.params, body: req.body });
    return ok(res, await s.actualizarDespesa(quem(req), params.id, body));
  };

  apagarDespesa = async (req: AuthRequest, res: Response) => {
    const { params } = despesaIdSchema.parse({ params: req.params });
    await s.apagarDespesa(quem(req), params.id);
    return res.status(204).send();
  };

  listarCategorias = async (_req: AuthRequest, res: Response) =>
    ok(res, { categorias: await s.listarCategorias() });

  criarCategoria = async (req: AuthRequest, res: Response) => {
    const { body } = criarCategoriaSchema.parse({ body: req.body });
    return res.status(201).json({ ok: true, data: await s.criarCategoria(body.nome) });
  };

  apagarCategoria = async (req: AuthRequest, res: Response) => {
    const { params } = categoriaIdSchema.parse({ params: req.params });
    await s.apagarCategoria(params.id);
    return res.status(204).send();
  };
}

export const companyController = new CompanyController();
