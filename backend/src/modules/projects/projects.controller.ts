// src/modules/projects/projects.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { projectsService } from './projects.service';
import {
  activateSchema, cancelSchema, closeSchema, createProjectSchema, expenseSchema,
  idParamSchema, listQuerySchema, monthParamSchema, subscribeSchema, updateProjectSchema,
} from './projects.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class ProjectsController {
  list = async (req: AuthRequest, res: Response) => {
    const { query } = listQuerySchema.parse({ query: req.query });
    return ok(res, { projects: await projectsService.list(getActor(req), query) });
  };

  get = async (req: AuthRequest, res: Response) => {
    const { params } = idParamSchema.parse({ params: req.params });
    return ok(res, await projectsService.get(getActor(req), params.id));
  };

  /** As participações do próprio. Antes de '/:id' nas rotas. */
  mine = async (req: AuthRequest, res: Response) =>
    ok(res, { shares: await projectsService.myShares(getActor(req)) });

  subscribe = async (req: AuthRequest, res: Response) => {
    const { params, body } = subscribeSchema.parse({ params: req.params, body: req.body });
    const share = await projectsService.subscribe(getActor(req), params.id, body.amount);
    return ok(res, { share }, 201);
  };

  // ── Administração ─────────────────────────────────────────────────────────

  create = async (req: AuthRequest, res: Response) => {
    const { body } = createProjectSchema.parse({ body: req.body });
    return ok(res, { project: await projectsService.create(getActor(req), body) }, 201);
  };

  update = async (req: AuthRequest, res: Response) => {
    const { params, body } = updateProjectSchema.parse({ params: req.params, body: req.body });
    return ok(res, { project: await projectsService.update(getActor(req), params.id, body) });
  };

  openFunding = async (req: AuthRequest, res: Response) => {
    const { params } = idParamSchema.parse({ params: req.params });
    return ok(res, { project: await projectsService.openFunding(getActor(req), params.id) });
  };

  activate = async (req: AuthRequest, res: Response) => {
    const { params, body } = activateSchema.parse({ params: req.params, body: req.body });
    return ok(res, { project: await projectsService.activate(getActor(req), params.id, body) });
  };

  cancel = async (req: AuthRequest, res: Response) => {
    const { params, body } = cancelSchema.parse({ params: req.params, body: req.body });
    return ok(res, await projectsService.cancel(getActor(req), params.id, body.reason));
  };

  close = async (req: AuthRequest, res: Response) => {
    const { params, body } = closeSchema.parse({ params: req.params, body: req.body });
    return ok(res, { project: await projectsService.close(getActor(req), params.id, body) });
  };

  computeMonth = async (req: AuthRequest, res: Response) => {
    const { params } = monthParamSchema.parse({ params: req.params });
    const period = await projectsService.computeMonth(getActor(req), params.id, params.month);
    return ok(res, { period });
  };

  computePending = async (req: AuthRequest, res: Response) => {
    const { params } = idParamSchema.parse({ params: req.params });
    return ok(res, { periods: await projectsService.computePending(getActor(req), params.id) });
  };

  distribute = async (req: AuthRequest, res: Response) => {
    const { params } = monthParamSchema.parse({ params: req.params });
    const period = await projectsService.distribute(getActor(req), params.id, params.month);
    return ok(res, { period });
  };

  addExpense = async (req: AuthRequest, res: Response) => {
    const { params, body } = expenseSchema.parse({ params: req.params, body: req.body });
    const period = await projectsService.addExpense(getActor(req), params.id, body);
    return ok(res, { period }, 201);
  };

  removeExpense = async (req: AuthRequest, res: Response) => {
    const { params } = idParamSchema.parse({ params: req.params });
    return ok(res, { period: await projectsService.removeExpense(getActor(req), params.id) });
  };
}

export const projectsController = new ProjectsController();
