// src/modules/investors/investors.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { prisma } from '../../config/prisma';
import { investorsService } from './investors.service';
import {
  accountQuerySchema, adjustSchema, createInvestorSchema, decideWithdrawalSchema,
  depositSchema, idParamSchema, requestWithdrawalSchema, setRateSchema,
  statementQuerySchema, updateAccountSchema,
} from './investors.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class InvestorsController {
  // ── O portal ──────────────────────────────────────────────────────────────

  me = async (req: AuthRequest, res: Response) =>
    ok(res, await investorsService.me(getActor(req)));

  statement = async (req: AuthRequest, res: Response) => {
    const { query } = statementQuerySchema.parse({ query: req.query });
    return ok(res, await investorsService.statement(getActor(req), query));
  };

  monthly = async (req: AuthRequest, res: Response) => {
    const { query } = accountQuerySchema.parse({ query: req.query });
    return ok(res, { months: await investorsService.monthlyEarnings(getActor(req), query.accountId) });
  };

  myWithdrawals = async (req: AuthRequest, res: Response) => {
    const { query } = accountQuerySchema.parse({ query: req.query });
    return ok(res, { withdrawals: await investorsService.myWithdrawals(getActor(req), query.accountId) });
  };

  requestWithdrawal = async (req: AuthRequest, res: Response) => {
    const { body } = requestWithdrawalSchema.parse({ body: req.body });
    const withdrawal = await investorsService.requestWithdrawal(getActor(req), body);
    return ok(res, { withdrawal }, 201);
  };

  cancelWithdrawal = async (req: AuthRequest, res: Response) => {
    const { params } = idParamSchema.parse({ params: req.params });
    return ok(res, await investorsService.cancelWithdrawal(getActor(req), params.id));
  };

  /**
   * As notificações do investidor, servidas daqui e não do módulo geral.
   *
   * O módulo de notificações vive do lado da frota, e uma conta de investidor
   * não passa por lá (ver `deny-investor.middleware.ts`). Duplicar estas duas
   * consultas é o preço de a lista de rotas permitidas a um investidor ser
   * curta o suficiente para se ler de uma vez.
   */
  notifications = async (req: AuthRequest, res: Response) => {
    const actor = getActor(req);
    const notifications = await prisma.notification.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return ok(res, { notifications });
  };

  readNotification = async (req: AuthRequest, res: Response) => {
    const actor = getActor(req);
    const { params } = idParamSchema.parse({ params: req.params });
    // updateMany com o userId no filtro: um update por id sozinho deixava
    // marcar como lida a notificação de outra pessoa.
    const { count } = await prisma.notification.updateMany({
      where: { id: params.id, userId: actor.id },
      data: { read: true },
    });
    if (count === 0) throw new AppError('Notificação não encontrada.', 404, 'NOT_FOUND');
    return ok(res, { ok: true });
  };

  // ── Administração ─────────────────────────────────────────────────────────

  listAccounts = async (req: AuthRequest, res: Response) =>
    ok(res, { accounts: await investorsService.listAccounts(getActor(req)) });

  overview = async (req: AuthRequest, res: Response) =>
    ok(res, await investorsService.overview(getActor(req)));

  getAccount = async (req: AuthRequest, res: Response) => {
    const { params } = idParamSchema.parse({ params: req.params });
    return ok(res, await investorsService.getAccount(getActor(req), params.id));
  };

  create = async (req: AuthRequest, res: Response) => {
    const { body } = createInvestorSchema.parse({ body: req.body });
    return ok(res, await investorsService.createInvestor(getActor(req), body), 201);
  };

  updateAccount = async (req: AuthRequest, res: Response) => {
    const { params, body } = updateAccountSchema.parse({ params: req.params, body: req.body });
    return ok(res, await investorsService.updateAccount(getActor(req), params.id, body));
  };

  deposit = async (req: AuthRequest, res: Response) => {
    const { params, body } = depositSchema.parse({ params: req.params, body: req.body });
    return ok(res, { balance: await investorsService.deposit(getActor(req), params.id, body) }, 201);
  };

  adjust = async (req: AuthRequest, res: Response) => {
    const { params, body } = adjustSchema.parse({ params: req.params, body: req.body });
    return ok(res, { balance: await investorsService.adjust(getActor(req), params.id, body) }, 201);
  };

  setRate = async (req: AuthRequest, res: Response) => {
    const { params, body } = setRateSchema.parse({ params: req.params, body: req.body });
    return ok(res, await investorsService.setRate(getActor(req), params.id, body));
  };

  pendingWithdrawals = async (req: AuthRequest, res: Response) =>
    ok(res, { withdrawals: await investorsService.pendingWithdrawals(getActor(req)) });

  decideWithdrawal = async (req: AuthRequest, res: Response) => {
    const { params, body } = decideWithdrawalSchema.parse({ params: req.params, body: req.body });
    return ok(res, { withdrawal: await investorsService.decideWithdrawal(getActor(req), params.id, body) });
  };
}

export const investorsController = new InvestorsController();
