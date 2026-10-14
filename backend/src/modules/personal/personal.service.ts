// src/modules/personal/personal.service.ts
//
// As finanças pessoais de uma conta: o diário de trading e as despesas.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  TUDO AQUI TRABALHA SOBRE O PRÓPRIO, E SÓ SOBRE O PRÓPRIO                ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Nenhuma função desta camada aceita o id de outra pessoa. Não há um parâmetro
// `userId` que um administrador possa preencher com o de outro: o id vem do
// `actor`, que vem da sessão, e mais nada.
//
// É deliberado e é mais apertado do que o resto do sistema. No resto, um
// administrador vê os dados dos motoristas dele porque esse é o trabalho dele.
// Aqui não: estas são as despesas do supermercado e as perdas na bolsa de uma
// pessoa, e não há papel nenhum nesta aplicação que justifique lê-las.
//
// ─── O QUE SAI DO SALDO E COMO ──────────────────────────────────────────────
//
// Uma despesa escreve um DÉBITO em `balanceAdjustment`, e é essa linha que o
// saldo desconta. Não se tocou na fórmula do saldo (vive na vista
// `driver_balances`): já esteve copiada em quatro sítios, e uma correção foi
// aplicada numa cópia e esquecida noutra.
//
// No extrato, esse débito diz apenas «Despesa pessoal». A categoria, a
// descrição e o comprovativo ficam deste lado, onde só o próprio entra — o
// extrato precisa do dinheiro para bater certo, não precisa de saber em quê.
//
// As duas escritas vão numa transação. Sem isso, uma falha a meio deixava uma
// despesa registada que o saldo nunca descontou (ou um débito órfão no
// extrato), e o saldo passava a mentir sem nada a apontar porquê.

import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/errors/AppError';
import { AdjustmentType } from '../../shared/types/enums';
import {
  resumirTrading, trandingPorMes, despesasPorCategoria, despesasPorMes,
  retornoPercentual,
} from './financas';

/** O que o extrato mostra. Ver a nota no topo. */
const MOTIVO_NO_EXTRATO = 'Despesa pessoal';

export type Actor = { id: string; personalFinance?: boolean };

export interface EntradaDeOperacao {
  asset: string;
  broker?: string | null;
  direction: 'LONG' | 'SHORT';
  openedAt: Date;
  closedAt?: Date | null;
  size?: number | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  result: number;
  fees?: number | null;
  notes?: string | null;
}

export interface EntradaDeDespesa {
  categoryId?: string | null;
  amount: number;
  spentOn: Date;
  notes?: string | null;
  receiptUrl?: string | null;
  receiptKey?: string | null;
}

function texto(v: string | null | undefined, maximo = 200): string | null {
  const t = (v ?? '').trim();
  if (!t) return null;
  return t.slice(0, maximo);
}

function numeroOuNulo(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Um valor de dinheiro que vem de um campo aberto.
 *
 * Recusa em vez de arredondar para zero: um valor que não é número é um engano
 * de quem escreveu, e gravá-lo como zero dava uma despesa de 0 € na lista e um
 * saldo que não descontou nada — o pior dos dois mundos, porque parece feito.
 */
function dinheiro(v: number, campo: string): number {
  if (!Number.isFinite(v)) {
    throw new AppError(`O valor de ${campo} não é um número.`, 400, 'INVALID_AMOUNT');
  }
  return Math.round(v * 100) / 100;
}

class PersonalService {
  // ─────────────────────────────────────────────────────────────── TRADING ──

  async listarOperacoes(actor: Actor) {
    const linhas = await prisma.tradeEntry.findMany({
      where: { userId: actor.id },
      orderBy: [{ openedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return linhas.map((o) => ({
      id: o.id,
      asset: o.asset,
      broker: o.broker,
      direction: o.direction,
      openedAt: o.openedAt,
      closedAt: o.closedAt,
      size: o.size === null ? null : Number(o.size),
      entryPrice: o.entryPrice === null ? null : Number(o.entryPrice),
      exitPrice: o.exitPrice === null ? null : Number(o.exitPrice),
      result: Number(o.result),
      fees: Number(o.fees),
      // O líquido vai calculado daqui, e não somado na tela: havendo duas
      // contas do mesmo número, uma delas acaba por divergir.
      liquido: Math.round((Number(o.result) - Math.abs(Number(o.fees))) * 100) / 100,
      retorno: retornoPercentual(
        o.entryPrice === null ? null : Number(o.entryPrice),
        o.exitPrice === null ? null : Number(o.exitPrice),
        o.direction as 'LONG' | 'SHORT',
      ),
      notes: o.notes,
    }));
  }

  async resumoDeTrading(actor: Actor) {
    const linhas = await prisma.tradeEntry.findMany({
      where: { userId: actor.id },
      select: { result: true, fees: true, openedAt: true },
    });

    const paraConta = linhas.map((o) => ({
      result: Number(o.result),
      fees: Number(o.fees),
      openedAt: o.openedAt,
    }));

    return { resumo: resumirTrading(paraConta), porMes: trandingPorMes(paraConta) };
  }

  async criarOperacao(actor: Actor, entrada: EntradaDeOperacao) {
    const asset = texto(entrada.asset, 60);
    if (!asset) throw new AppError('Diga o que negociou.', 400, 'ASSET_REQUIRED');

    return prisma.tradeEntry.create({
      data: {
        userId: actor.id,
        asset,
        broker: texto(entrada.broker, 60),
        direction: entrada.direction,
        openedAt: entrada.openedAt,
        closedAt: entrada.closedAt ?? null,
        size: numeroOuNulo(entrada.size),
        entryPrice: numeroOuNulo(entrada.entryPrice),
        exitPrice: numeroOuNulo(entrada.exitPrice),
        result: dinheiro(entrada.result, 'resultado'),
        // As comissões são sempre um custo. Um menos escrito à mão passaria a
        // somar ao lucro — ver o teste em `financas.test.ts`.
        fees: Math.abs(dinheiro(entrada.fees ?? 0, 'comissões')),
        notes: texto(entrada.notes, 1000),
      },
    });
  }

  async actualizarOperacao(actor: Actor, id: string, entrada: EntradaDeOperacao) {
    await this.operacaoDoProprio(actor, id);

    const asset = texto(entrada.asset, 60);
    if (!asset) throw new AppError('Diga o que negociou.', 400, 'ASSET_REQUIRED');

    return prisma.tradeEntry.update({
      where: { id },
      data: {
        asset,
        broker: texto(entrada.broker, 60),
        direction: entrada.direction,
        openedAt: entrada.openedAt,
        closedAt: entrada.closedAt ?? null,
        size: numeroOuNulo(entrada.size),
        entryPrice: numeroOuNulo(entrada.entryPrice),
        exitPrice: numeroOuNulo(entrada.exitPrice),
        result: dinheiro(entrada.result, 'resultado'),
        fees: Math.abs(dinheiro(entrada.fees ?? 0, 'comissões')),
        notes: texto(entrada.notes, 1000),
      },
    });
  }

  async apagarOperacao(actor: Actor, id: string) {
    await this.operacaoDoProprio(actor, id);
    await prisma.tradeEntry.delete({ where: { id } });
  }

  /**
   * A operação existe E é desta pessoa.
   *
   * A pergunta é feita com o `userId` no filtro e não depois de ler: assim um
   * id de outra pessoa dá exactamente a mesma resposta que um id inventado —
   * «não existe» — e ninguém descobre, por tentativa, o que é que lá está.
   */
  private async operacaoDoProprio(actor: Actor, id: string) {
    const o = await prisma.tradeEntry.findFirst({
      where: { id, userId: actor.id }, select: { id: true },
    });
    if (!o) throw new AppError('Operação não encontrada.', 404, 'TRADE_NOT_FOUND');
    return o;
  }

  // ───────────────────────────────────────────────────────────── CATEGORIAS ──

  async listarCategorias(actor: Actor) {
    return prisma.personalExpenseCategory.findMany({
      where: { userId: actor.id },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async criarCategoria(actor: Actor, nome: string) {
    const name = texto(nome, 40);
    if (!name) throw new AppError('Dê um nome à categoria.', 400, 'NAME_REQUIRED');

    const repetida = await prisma.personalExpenseCategory.findFirst({
      where: { userId: actor.id, name }, select: { id: true },
    });
    if (repetida) {
      throw new AppError('Já tem uma categoria com esse nome.', 409, 'CATEGORY_EXISTS');
    }

    const quantas = await prisma.personalExpenseCategory.count({ where: { userId: actor.id } });
    return prisma.personalExpenseCategory.create({
      data: { userId: actor.id, name, sortOrder: quantas },
    });
  }

  /**
   * Apagar uma gaveta não apaga o que estava lá dentro.
   *
   * As despesas ficam sem categoria (a chave estrangeira põe-nas a nulo) e
   * continuam a contar no total, numa linha «sem categoria». Levá-las atrás
   * mudava o saldo e o histórico por causa de uma arrumação.
   */
  async apagarCategoria(actor: Actor, id: string) {
    const c = await prisma.personalExpenseCategory.findFirst({
      where: { id, userId: actor.id }, select: { id: true },
    });
    if (!c) throw new AppError('Categoria não encontrada.', 404, 'CATEGORY_NOT_FOUND');
    await prisma.personalExpenseCategory.delete({ where: { id } });
  }

  // ─────────────────────────────────────────────────────────────── DESPESAS ──

  async listarDespesas(actor: Actor) {
    const linhas = await prisma.personalExpense.findMany({
      where: { userId: actor.id },
      orderBy: [{ spentOn: 'desc' }, { createdAt: 'desc' }],
      include: { category: { select: { id: true, name: true } } },
    });

    return linhas.map((e) => ({
      id: e.id,
      categoria: e.category,
      amount: Number(e.amount),
      spentOn: e.spentOn,
      notes: e.notes,
      receiptUrl: e.receiptUrl,
      /** Para a tela poder dizer se o saldo já descontou isto. */
      lancadaNoSaldo: e.adjustmentId !== null,
    }));
  }

  async resumoDeDespesas(actor: Actor) {
    const linhas = await prisma.personalExpense.findMany({
      where: { userId: actor.id },
      select: { amount: true, spentOn: true, categoryId: true },
    });

    const paraConta = linhas.map((e) => ({
      amount: Number(e.amount), spentOn: e.spentOn, categoryId: e.categoryId,
    }));

    const categorias = await this.listarCategorias(actor);
    const nomes = new Map(categorias.map((c) => [c.id, c.name]));

    return {
      total: paraConta.reduce((s, e) => s + Math.abs(e.amount), 0),
      porMes: despesasPorMes(paraConta),
      porCategoria: despesasPorCategoria(paraConta).map((l) => ({
        ...l,
        nome: l.categoriaId === null ? 'Sem categoria' : nomes.get(l.categoriaId) ?? 'Apagada',
      })),
    };
  }

  /**
   * Lança a despesa e desconta-a do saldo, de uma vez só.
   *
   * As duas escritas vão na mesma transação. Separadas, uma falha a meio
   * deixava uma despesa que o saldo nunca viu — e um saldo que mente sem nada
   * a apontar porquê é pior do que um erro que rebenta.
   */
  async criarDespesa(actor: Actor, entrada: EntradaDeDespesa) {
    const valor = Math.abs(dinheiro(entrada.amount, 'despesa'));
    if (valor === 0) {
      throw new AppError('O valor da despesa não pode ser zero.', 400, 'AMOUNT_REQUIRED');
    }
    await this.categoriaDoProprioOuNula(actor, entrada.categoryId);

    return prisma.$transaction(async (tx) => {
      const ajuste = await tx.balanceAdjustment.create({
        data: {
          userId: actor.id,
          amount: valor,
          type: AdjustmentType.DEBIT,
          reason: MOTIVO_NO_EXTRATO,
          createdBy: actor.id,
          // A data do movimento é a da despesa, e não a de hoje: um gasto da
          // semana passada lançado hoje tem de ancorar na semana passada,
          // senão os saldos corridos do extrato ficam errados nesses dias.
          createdAt: entrada.spentOn,
        },
        select: { id: true },
      });

      // Escrita separada e não aninhada: a camada do âmbito só carimba a frota
      // no `data` de primeiro nível, e uma criação aninhada nascia com a frota
      // vazia. Já partiu a criação de um plano de investimento neste projeto.
      return tx.personalExpense.create({
        data: {
          userId: actor.id,
          categoryId: entrada.categoryId ?? null,
          amount: valor,
          spentOn: entrada.spentOn,
          notes: texto(entrada.notes, 500),
          receiptUrl: entrada.receiptUrl ?? null,
          receiptKey: entrada.receiptKey ?? null,
          adjustmentId: ajuste.id,
        },
      });
    });
  }

  async actualizarDespesa(actor: Actor, id: string, entrada: EntradaDeDespesa) {
    const actual = await prisma.personalExpense.findFirst({
      where: { id, userId: actor.id },
      select: { id: true, adjustmentId: true },
    });
    if (!actual) throw new AppError('Despesa não encontrada.', 404, 'EXPENSE_NOT_FOUND');

    const valor = Math.abs(dinheiro(entrada.amount, 'despesa'));
    if (valor === 0) {
      throw new AppError('O valor da despesa não pode ser zero.', 400, 'AMOUNT_REQUIRED');
    }
    await this.categoriaDoProprioOuNula(actor, entrada.categoryId);

    return prisma.$transaction(async (tx) => {
      // O débito acompanha a despesa. Se ficasse para trás, o extrato passava
      // a dizer um valor e a lista pessoal outro, sem nada a ligar os dois.
      if (actual.adjustmentId) {
        await tx.balanceAdjustment.update({
          where: { id: actual.adjustmentId },
          data: { amount: valor, createdAt: entrada.spentOn },
        });
      }

      return tx.personalExpense.update({
        where: { id },
        data: {
          categoryId: entrada.categoryId ?? null,
          amount: valor,
          spentOn: entrada.spentOn,
          notes: texto(entrada.notes, 500),
          ...(entrada.receiptUrl !== undefined
            ? { receiptUrl: entrada.receiptUrl, receiptKey: entrada.receiptKey ?? null }
            : {}),
        },
      });
    });
  }

  /** Apaga a despesa e devolve o dinheiro ao saldo, apagando o débito. */
  async apagarDespesa(actor: Actor, id: string) {
    const actual = await prisma.personalExpense.findFirst({
      where: { id, userId: actor.id },
      select: { id: true, adjustmentId: true },
    });
    if (!actual) throw new AppError('Despesa não encontrada.', 404, 'EXPENSE_NOT_FOUND');

    await prisma.$transaction(async (tx) => {
      await tx.personalExpense.delete({ where: { id } });
      if (actual.adjustmentId) {
        await tx.balanceAdjustment.delete({ where: { id: actual.adjustmentId } });
      }
    });
  }

  /** A categoria é desta pessoa, ou não foi indicada nenhuma. */
  private async categoriaDoProprioOuNula(actor: Actor, categoryId?: string | null) {
    if (!categoryId) return;
    const c = await prisma.personalExpenseCategory.findFirst({
      where: { id: categoryId, userId: actor.id }, select: { id: true },
    });
    if (!c) throw new AppError('Categoria não encontrada.', 404, 'CATEGORY_NOT_FOUND');
  }
}

export const personalService = new PersonalService();
