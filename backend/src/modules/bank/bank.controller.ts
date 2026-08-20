// src/modules/bank/bank.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { uploadToCloudinary } from '../upload/upload.service';
import { bankService } from './bank.service';
import { bankUserParamSchema, reviewBankSchema, submitBankSchema } from './bank.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class BankController {
  // GET /bank/me — os próprios dados
  getMine = async (req: AuthRequest, res: Response) => {
    const actor = getActor(req);
    const account = await bankService.get(actor, actor.id);
    return ok(res, { account });
  };

  // GET /bank/pending — fila de alterações à espera de decisão
  listPending = async (req: AuthRequest, res: Response) => {
    const accounts = await bankService.listPending(getActor(req));
    return ok(res, { accounts });
  };

  // GET /bank/:userId — a gestão consulta os dados de um motorista
  getByUser = async (req: AuthRequest, res: Response) => {
    const parsed = bankUserParamSchema.parse({ params: req.params });
    const account = await bankService.get(getActor(req), parsed.params.userId);
    return ok(res, { account });
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
      proofUrl: fileUrl,
      proofKey: fileKey,
    });

    return ok(res, { account }, 201);
  };

  // PATCH /bank/:userId/review — aprovar ou recusar
  review = async (req: AuthRequest, res: Response) => {
    const parsed = reviewBankSchema.parse({ params: req.params, body: req.body });
    const account = await bankService.review(
      getActor(req),
      parsed.params.userId,
      parsed.body,
    );
    return ok(res, { account });
  };
}

export const bankController = new BankController();
