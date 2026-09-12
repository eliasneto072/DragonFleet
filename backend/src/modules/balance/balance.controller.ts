import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { balanceService } from './balance.service';
import { ledgerService } from './ledger.service';
import { balanceUserParamSchema, createAdjustmentSchema } from './balance.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) {
    throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  }
  return { id: req.user.id, role: req.user.role };
}

export class BalanceController {
  getSummary = async (req: AuthRequest, res: Response) => {
    const parsed = balanceUserParamSchema.parse({ params: req.params });
    const balance = await balanceService.getSummary(getActor(req), parsed.params.userId);
    return ok(res, { balance });
  };

  /**
   * GET /balance/:userId/ledger
   *
   * O extrato: os movimentos por ordem e o saldo em conta depois de cada um.
   *
   * Sem paginacao, de proposito. Um acumulado partido em paginas nao tem
   * significado — a primeira linha da pagina dois comecaria de um saldo que
   * nao esta no ecra. Se um dia um motorista tiver movimentos suficientes para
   * isto pesar, a saida e filtrar por periodo e nao paginar.
   */
  getLedger = async (req: AuthRequest, res: Response) => {
    const parsed = balanceUserParamSchema.parse({ params: req.params });
    const ledger = await ledgerService.forDriver(getActor(req), parsed.params.userId);
    return ok(res, ledger);
  };

  listAdjustments = async (req: AuthRequest, res: Response) => {
    const parsed = balanceUserParamSchema.parse({ params: req.params });
    const adjustments = await balanceService.listAdjustments(getActor(req), parsed.params.userId);
    return ok(res, { adjustments });
  };

  createAdjustment = async (req: AuthRequest, res: Response) => {
    const parsed = createAdjustmentSchema.parse({ params: req.params, body: req.body });
    const adjustment = await balanceService.createAdjustment(
      getActor(req),
      parsed.params.userId,
      parsed.body,
    );
    return ok(res, { adjustment }, 201);
  };
}

export const balanceController = new BalanceController();