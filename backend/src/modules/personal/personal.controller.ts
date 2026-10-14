// src/modules/personal/personal.controller.ts
//
// As finanças pessoais, do lado do HTTP.
//
// ─── O `actor` É SEMPRE A SESSÃO ────────────────────────────────────────────
//
// Nenhuma destas funções lê um id de pessoa do corpo do pedido ou do endereço.
// O id vem de `req.user.id`, que vem do token. Um `userId` aceite daqui era
// tudo o que separava estas rotas de qualquer pessoa poder ler as despesas de
// qualquer outra — e seria uma linha fácil de acrescentar por distração, por
// isso o serviço também não tem onde a receber.
//
// ─── TUDO O QUE ENTRA PASSA PELO ZOD ────────────────────────────────────────
//
// Como no resto do projeto, e não por gosto de uniformidade: as rotas aqui
// recebem datas e valores de dinheiro escritos à mão, e é no `personal.schemas`
// que "2026-10-14" vira um dia que não escorrega de mês por causa do fuso, e
// que "12,50" vira doze euros e meio em vez de `NaN`.

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { personalService as s } from './personal.service';
import {
  operacaoIdSchema, criarOperacaoSchema, actualizarOperacaoSchema,
  categoriaIdSchema, criarCategoriaSchema,
  despesaIdSchema, criarDespesaSchema, actualizarDespesaSchema,
} from './personal.schemas';

/** O actor, a partir da sessão e de mais nada. */
function quem(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Sem sessão.', 401, 'UNAUTHORIZED');
  return { id: req.user.id };
}

export class PersonalController {
  // ── Trading ──

  listarOperacoes = async (req: AuthRequest, res: Response) =>
    ok(res, { operacoes: await s.listarOperacoes(quem(req)) });

  resumoDeTrading = async (req: AuthRequest, res: Response) =>
    ok(res, await s.resumoDeTrading(quem(req)));

  criarOperacao = async (req: AuthRequest, res: Response) => {
    const { body } = criarOperacaoSchema.parse({ body: req.body });
    return res.status(201).json({ ok: true, data: await s.criarOperacao(quem(req), body) });
  };

  actualizarOperacao = async (req: AuthRequest, res: Response) => {
    const { params, body } = actualizarOperacaoSchema.parse({
      params: req.params, body: req.body,
    });
    return ok(res, await s.actualizarOperacao(quem(req), params.id, body));
  };

  apagarOperacao = async (req: AuthRequest, res: Response) => {
    const { params } = operacaoIdSchema.parse({ params: req.params });
    await s.apagarOperacao(quem(req), params.id);
    return res.status(204).send();
  };

  // ── Categorias ──

  listarCategorias = async (req: AuthRequest, res: Response) =>
    ok(res, { categorias: await s.listarCategorias(quem(req)) });

  criarCategoria = async (req: AuthRequest, res: Response) => {
    const { body } = criarCategoriaSchema.parse({ body: req.body });
    return res.status(201).json({
      ok: true, data: await s.criarCategoria(quem(req), body.nome),
    });
  };

  apagarCategoria = async (req: AuthRequest, res: Response) => {
    const { params } = categoriaIdSchema.parse({ params: req.params });
    await s.apagarCategoria(quem(req), params.id);
    return res.status(204).send();
  };

  // ── Despesas ──

  listarDespesas = async (req: AuthRequest, res: Response) =>
    ok(res, { despesas: await s.listarDespesas(quem(req)) });

  resumoDeDespesas = async (req: AuthRequest, res: Response) =>
    ok(res, await s.resumoDeDespesas(quem(req)));

  criarDespesa = async (req: AuthRequest, res: Response) => {
    const { body } = criarDespesaSchema.parse({ body: req.body });
    return res.status(201).json({ ok: true, data: await s.criarDespesa(quem(req), body) });
  };

  actualizarDespesa = async (req: AuthRequest, res: Response) => {
    const { params, body } = actualizarDespesaSchema.parse({
      params: req.params, body: req.body,
    });
    return ok(res, await s.actualizarDespesa(quem(req), params.id, body));
  };

  apagarDespesa = async (req: AuthRequest, res: Response) => {
    const { params } = despesaIdSchema.parse({ params: req.params });
    await s.apagarDespesa(quem(req), params.id);
    return res.status(204).send();
  };
}

export const personalController = new PersonalController();
