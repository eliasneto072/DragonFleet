// src/modules/leads/publico.controller.ts
//
// O que o site mostra a quem ainda não entrou.
//
// ─── PORQUE É QUE OS PLANOS TÊM UMA ROTA PRÓPRIA ────────────────────────────
//
// Porque a que já existe (`/system/planos`) é do painel do dono: devolve as
// notas comerciais, quantas frotas estão em cada plano e os arquivados. Nada
// disso é para uma página pública.
//
// Esta devolve campo a campo — nome, preço, duração e o que inclui — e só dos
// planos à venda. É a escolha explícita dos campos que garante que uma coluna
// nova no plano não aparece no site sem ninguém decidir que devia.

import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { comoSistema } from '../../config/escopo';
import { ok } from '../../shared/http/response';
import { normalizarFuncionalidades, nomeDaFuncionalidade } from '../system/funcionalidades';

export class PublicoController {
  /** Os planos à venda. Sem sessão: é a página de preços. */
  planos = async (_req: Request, res: Response) => {
    // Atravessa frotas porque os planos não são de nenhuma — são da
    // plataforma, e estão em `MODELOS_GLOBAIS`. O `comoSistema` está aqui
    // porque quem pergunta não tem sessão e não há âmbito nenhum definido.
    const linhas = await comoSistema(async () => await prisma.plan.findMany({
      where: { active: true },
      orderBy: [{ price: 'asc' }],
      select: { id: true, name: true, price: true, durationDays: true, features: true },
    }));

    return ok(res, {
      planos: linhas.map((p) => ({
        id: p.id,
        nome: p.name,
        preco: p.price.toString(),
        duracaoDias: p.durationDays,
        inclui: normalizarFuncionalidades(p.features).map((c) => ({
          codigo: c,
          nome: nomeDaFuncionalidade(c),
        })),
      })),
    });
  };
}

export const publicoController = new PublicoController();
