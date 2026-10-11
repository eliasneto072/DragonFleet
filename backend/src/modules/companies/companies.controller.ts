// src/modules/companies/companies.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { companiesService } from './companies.service';
import {
  companyIdParamSchema,
  createCompanySchema,
  listCompaniesSchema,
  updateCompanySchema,
} from './companies.schemas';

export class CompaniesController {
  // GET /companies — a lista para classificar um recibo.
  // `?all=1` inclui as desativadas, para a tela de gestão as poder reativar.
  list = async (req: AuthRequest, res: Response) => {
    const parsed = listCompaniesSchema.parse({ query: req.query });
    const companies = await companiesService.list(parsed.query.all === '1');
    return ok(res, { companies });
  };

  /**
   * A tabela cruzada: motoristas nas linhas, sociedades nas colunas.
   *
   * O ano vem na query. Sem ele, o actual — é o que se quer ver em nove de
   * cada dez vezes, e obrigar a escolher antes de mostrar o que quer que seja
   * é um clique a mais todos os dias.
   */
  porMotorista = async (req: AuthRequest, res: Response) => {
    const bruto = (req.query as Record<string, unknown>)?.ano;
    const pedido = Number(bruto);
    const ano = Number.isInteger(pedido) && pedido >= 2000 && pedido <= 2100
      ? pedido
      : new Date().getFullYear();

    return ok(res, await companiesService.matrizPorMotorista(ano));
  };

  create = async (req: AuthRequest, res: Response) => {
    const parsed = createCompanySchema.parse({ body: req.body });
    const company = await companiesService.create(parsed.body.name);
    return ok(res, { company }, 201);
  };

  update = async (req: AuthRequest, res: Response) => {
    const parsed = updateCompanySchema.parse({ params: req.params, body: req.body });
    const company = await companiesService.update(parsed.params.id, parsed.body);
    return ok(res, { company });
  };

  remove = async (req: AuthRequest, res: Response) => {
    const parsed = companyIdParamSchema.parse({ params: req.params });
    const result = await companiesService.remove(parsed.params.id);
    return ok(res, result);
  };
}

export const companiesController = new CompaniesController();
