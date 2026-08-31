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
