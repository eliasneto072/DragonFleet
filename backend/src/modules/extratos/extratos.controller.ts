// src/modules/extratos/extratos.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { extratosService, type Ambito } from './extratos.service';
import {
  ambitoQuerySchema, extratoIdSchema, importarSchema, preverSchema,
} from './extratos.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class ExtratosController {
  // GET /extratos/contas?ambito=PESSOAL
  contas = async (req: AuthRequest, res: Response) => {
    const p = ambitoQuerySchema.parse({ query: req.query });
    const contas = await extratosService.contas(getActor(req), p.query.ambito as Ambito);
    return ok(res, { contas });
  };

  /**
   * POST /extratos/prever — multipart, com o PDF.
   *
   * Lê e devolve. NÃO grava nada: é o passo do «mostrar primeiro».
   */
  prever = async (req: AuthRequest, res: Response) => {
    const p = preverSchema.parse({ body: req.body });
    if (!req.file) {
      throw new AppError('Escolha o ficheiro do extrato.', 400, 'FILE_REQUIRED');
    }
    const previsao = await extratosService.prever(
      getActor(req), p.body.ambito as Ambito, req.file.buffer, req.file.originalname,
    );
    return ok(res, previsao);
  };

  // POST /extratos/importar — grava o que ele confirmou
  importar = async (req: AuthRequest, res: Response) => {
    const p = importarSchema.parse({ body: req.body });
    const r = await extratosService.importar(getActor(req), {
      ambito: p.body.ambito as Ambito,
      contaId: p.body.contaId ?? null,
      novaConta: p.body.novaConta ?? null,
      ficheiro: p.body.ficheiro,
      periodo: { de: p.body.periodo.de ?? null, ate: p.body.periodo.ate ?? null },
      saldoInicial: p.body.saldoInicial ?? null,
      saldoFinal: p.body.saldoFinal ?? null,
      movimentos: p.body.movimentos.map((m) => ({
        ...m,
        dataLancamento: m.dataLancamento ?? null,
        saldo: m.saldo ?? null,
        referencia: m.referencia ?? null,
        motivo: m.motivo ?? '',
        confianca: m.confianca ?? 'pelo-sinal',
      })),
    });
    return ok(res, r, 201);
  };

  // GET /extratos?ambito=EMPRESA
  listar = async (req: AuthRequest, res: Response) => {
    const p = ambitoQuerySchema.parse({ query: req.query });
    const extratos = await extratosService.listar(getActor(req), p.query.ambito as Ambito);
    return ok(res, { extratos });
  };

  // GET /extratos/:id/movimentos?ambito=EMPRESA
  movimentos = async (req: AuthRequest, res: Response) => {
    const p = extratoIdSchema.parse({ params: req.params, query: req.query });
    const movimentos = await extratosService.movimentos(
      getActor(req), p.query.ambito as Ambito, p.params.id,
    );
    return ok(res, { movimentos });
  };

  // DELETE /extratos/:id?ambito=EMPRESA
  apagar = async (req: AuthRequest, res: Response) => {
    const p = extratoIdSchema.parse({ params: req.params, query: req.query });
    await extratosService.apagar(getActor(req), p.query.ambito as Ambito, p.params.id);
    return ok(res, { ok: true });
  };
}

export const extratosController = new ExtratosController();
