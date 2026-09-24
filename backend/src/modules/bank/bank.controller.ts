// src/modules/bank/bank.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { uploadToCloudinary } from '../upload/upload.service';
import { bankService } from './bank.service';
import {
  accountParamSchema, bankUserParamSchema, renameBankSchema,
  reviewBankSchema, submitBankSchema,
} from './bank.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class BankController {
  // GET /bank/me — as próprias contas
  getMine = async (req: AuthRequest, res: Response) => {
    const actor = getActor(req);
    return ok(res, { accounts: await bankService.list(actor, actor.id) });
  };

  // GET /bank/pending — fila de alterações à espera de decisão
  listPending = async (req: AuthRequest, res: Response) => {
    const { items, page } = await bankService.listPending(getActor(req), {
      search: req.query.search,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    // `accounts` mantém o nome; o que muda é ser uma página.
    return ok(res, { accounts: items, page });
  };

  // GET /bank/:userId — a gestão consulta as contas de um motorista
  getByUser = async (req: AuthRequest, res: Response) => {
    const parsed = bankUserParamSchema.parse({ params: req.params });
    return ok(res, { accounts: await bankService.list(getActor(req), parsed.params.userId) });
  };

  /**
   * POST /bank — multipart, com o comprovativo.
   *
   * Não usa apiClient/JSON porque o ficheiro vem no mesmo pedido: exigir dois
   * passos permitiria gravar um IBAN sem prova, que é precisamente o que a
   * aprovação existe para impedir.
   */
  submit = async (req: AuthRequest, res: Response) => {
    const actor = getActor(req);
    const parsed = submitBankSchema.parse({ body: req.body });

    if (!req.file) {
      throw new AppError(
        'Anexe o comprovativo de titularidade da conta.',
        400,
        'MISSING_PROOF',
      );
    }

    const { fileUrl, fileKey } = await uploadToCloudinary(
      req.file.buffer,
      req.file.mimetype,
      'bank-proofs',
    );

    const account = await bankService.submit(actor, actor.id, {
      iban: parsed.body.iban,
      holderName: parsed.body.holderName,
      label: parsed.body.label,
      accountId: parsed.body.accountId,
      proofUrl: fileUrl,
      proofKey: fileKey,
    });

    return ok(res, { account }, 201);
  };

  // PATCH /bank/accounts/:id/review — aprovar ou recusar
  review = async (req: AuthRequest, res: Response) => {
    const parsed = reviewBankSchema.parse({ params: req.params, body: req.body });
    const account = await bankService.review(getActor(req), parsed.params.id, parsed.body);
    return ok(res, { account });
  };

  // PATCH /bank/accounts/:id/primary — passa a ser a conta por omissão
  setPrimary = async (req: AuthRequest, res: Response) => {
    const parsed = accountParamSchema.parse({ params: req.params });
    return ok(res, { accounts: await bankService.setPrimary(getActor(req), parsed.params.id) });
  };

  // PATCH /bank/accounts/:id — muda o nome da conta
  rename = async (req: AuthRequest, res: Response) => {
    const parsed = renameBankSchema.parse({ params: req.params, body: req.body });
    const account = await bankService.rename(getActor(req), parsed.params.id, parsed.body.label);
    return ok(res, { account });
  };

  // DELETE /bank/accounts/:id — arquiva
  archive = async (req: AuthRequest, res: Response) => {
    const parsed = accountParamSchema.parse({ params: req.params });
    return ok(res, { accounts: await bankService.archive(getActor(req), parsed.params.id) });
  };
}

export const bankController = new BankController();
