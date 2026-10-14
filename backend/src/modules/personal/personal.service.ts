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
import {
  estadoDoCredito, jurosPorAno, prestacaoBateCerto, quadroDeAmortizacao,
} from './creditos';

/** O que o extrato mostra. Ver a nota no topo. */
const MOTIVO_NO_EXTRATO = 'Despesa pessoal';

export type Actor = { id: string; personalFinance?: boolean };

/**
 * O período que se está a ver. Os dois extremos são INCLUSIVOS.
 *
 * ─── PORQUE É QUE O FILTRO É AQUI E NÃO NO NAVEGADOR ──────────────────────
 *
 * Porque o total e a lista têm de vir da mesma conta. Filtrada no navegador,
 * a lista era uma contagem e o resumo era outra — e bastava uma delas tratar
 * o último dia do mês de maneira diferente para o total deixar de bater com
 * as linhas que estão à vista. Um número que não bate sem explicação é o que
 * faz desconfiar da aplicação inteira.
 *
 * Aqui há uma só condição, e serve as duas respostas.
 */
export interface Periodo {
  de?: Date | null;
  ate?: Date | null;
}

/**
 * A condição do período para uma coluna de data.
 *
 * `lte` e não `lt`: o último dia CONTA. Com o fim exclusivo, «este mês»
 * acabava a 30 e as despesas do dia 31 desapareciam da conta.
 */
function noPeriodo(p: Periodo | undefined) {
  if (!p?.de && !p?.ate) return {};
  return {
    ...(p.de ? { gte: p.de } : {}),
    ...(p.ate ? { lte: p.ate } : {}),
  };
}

function filtroDeData(campo: string, p: Periodo | undefined) {
  const cond = noPeriodo(p);
  return Object.keys(cond).length > 0 ? { [campo]: cond } : {};
}

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

export interface EntradaDeCredito {
  name: string;
  lender?: string | null;
  principal: number;
  startedOn: Date;
  installments: number;
  monthlyPayment?: number | null;
  tan?: number | null;
  taeg?: number | null;
  mtic?: number | null;
  notes?: string | null;
  closedOn?: Date | null;
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

  async listarOperacoes(actor: Actor, periodo?: Periodo) {
    const linhas = await prisma.tradeEntry.findMany({
      where: { userId: actor.id, ...filtroDeData('openedAt', periodo) },
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

  async resumoDeTrading(actor: Actor, periodo?: Periodo) {
    const linhas = await prisma.tradeEntry.findMany({
      where: { userId: actor.id, ...filtroDeData('openedAt', periodo) },
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

  async listarDespesas(actor: Actor, periodo?: Periodo) {
    const linhas = await prisma.personalExpense.findMany({
      where: { userId: actor.id, ...filtroDeData('spentOn', periodo) },
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

  async resumoDeDespesas(actor: Actor, periodo?: Periodo) {
    const linhas = await prisma.personalExpense.findMany({
      where: { userId: actor.id, ...filtroDeData('spentOn', periodo) },
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

  // ─────────────────────────────────────────────────────────────── CRÉDITOS ──
  //
  // Guarda-se o contrato; tudo o resto é calculado na hora por `creditos.ts`.
  // Guardar «quanto já foi pago» dava um número que ficava velho no dia
  // seguinte — e um número guardado que diverge do que a fórmula diz é uma
  // avaria que ninguém encontra, porque os dois parecem plausíveis.

  async listarCreditos(actor: Actor, hoje: Date = new Date()) {
    const linhas = await prisma.credit.findMany({
      where: { userId: actor.id },
      orderBy: [{ closedOn: 'asc' }, { startedOn: 'asc' }],
    });

    return linhas.map((c) => this.comAsContas(c, hoje));
  }

  async verCredito(actor: Actor, id: string, hoje: Date = new Date()) {
    const c = await prisma.credit.findFirst({ where: { id, userId: actor.id } });
    if (!c) throw new AppError('Crédito não encontrado.', 404, 'CREDIT_NOT_FOUND');

    const base = {
      capital: Number(c.principal),
      tan: Number(c.tan),
      prestacoes: c.installments,
      inicio: c.startedOn,
    };

    return {
      ...this.comAsContas(c, hoje),
      /** O quadro completo, prestação a prestação. */
      quadro: quadroDeAmortizacao(base),
      /** Ano a ano: quanto se pagou e quanto disso foi juro. */
      porAno: jurosPorAno(base),
    };
  }

  /**
   * O resumo de todos os créditos juntos.
   *
   * ─── PORQUE É QUE OS CRÉDITOS LIQUIDADOS FICAM DE FORA DO «EM DÍVIDA» ─────
   *
   * Porque já não se devem. Mas CONTAM nos juros já pagos, que é dinheiro que
   * saiu de facto — tirá-los de lá dava a ideia de que os créditos antigos
   * foram de graça.
   */
  async resumoDeCreditos(actor: Actor, hoje: Date = new Date()) {
    const creditos = await this.listarCreditos(actor, hoje);
    const aCorrer = creditos.filter((c) => !c.liquidado && !c.estado.terminado);

    const somar = (ls: typeof creditos, f: (c: typeof creditos[number]) => number) =>
      Math.round(ls.reduce((s, c) => s + f(c) * 100, 0)) / 100;

    const emDivida = somar(aCorrer, (c) => c.estado.emDivida);
    const jurosPagos = somar(creditos, (c) => c.estado.jurosPagos);
    const jurosPorPagar = somar(aCorrer, (c) => c.estado.jurosPorPagar);

    // Ano a ano, com todos os créditos somados: é o gráfico que mostra o peso
    // real da dívida ao longo do tempo.
    const porAno = new Map<number, { pago: number; juro: number; capital: number }>();
    for (const c of creditos) {
      for (const a of c.porAno) {
        const v = porAno.get(a.ano) ?? { pago: 0, juro: 0, capital: 0 };
        v.pago += Math.round(a.pago * 100);
        v.juro += Math.round(a.juro * 100);
        v.capital += Math.round(a.capital * 100);
        porAno.set(a.ano, v);
      }
    }

    return {
      aCorrer: aCorrer.length,
      total: creditos.length,
      emDivida,
      /** O que sai todos os meses, somado. */
      prestacaoMensal: somar(aCorrer, (c) => c.prestacaoEmVigor),
      jurosPagos,
      jurosPorPagar,
      jurosTotais: Math.round((jurosPagos + jurosPorPagar) * 100) / 100,
      porAno: [...porAno.entries()].sort((a, b) => a[0] - b[0]).map(([ano, v]) => ({
        ano,
        pago: v.pago / 100,
        juro: v.juro / 100,
        capital: v.capital / 100,
        percentagemEmJuros: v.pago > 0 ? Math.round((v.juro / v.pago) * 1000) / 10 : 0,
      })),
    };
  }

  async criarCredito(actor: Actor, entrada: EntradaDeCredito) {
    return prisma.credit.create({ data: this.dadosDoCredito(actor, entrada) });
  }

  async actualizarCredito(actor: Actor, id: string, entrada: EntradaDeCredito) {
    const existe = await prisma.credit.findFirst({
      where: { id, userId: actor.id }, select: { id: true },
    });
    if (!existe) throw new AppError('Crédito não encontrado.', 404, 'CREDIT_NOT_FOUND');

    const { userId, ...dados } = this.dadosDoCredito(actor, entrada);
    return prisma.credit.update({ where: { id }, data: dados });
  }

  async apagarCredito(actor: Actor, id: string) {
    const existe = await prisma.credit.findFirst({
      where: { id, userId: actor.id }, select: { id: true },
    });
    if (!existe) throw new AppError('Crédito não encontrado.', 404, 'CREDIT_NOT_FOUND');
    await prisma.credit.delete({ where: { id } });
  }

  private dadosDoCredito(actor: Actor, e: EntradaDeCredito) {
    const nome = texto(e.name, 80);
    if (!nome) throw new AppError('Dê um nome ao crédito.', 400, 'NAME_REQUIRED');

    return {
      userId: actor.id,
      name: nome,
      lender: texto(e.lender, 80),
      principal: Math.abs(dinheiro(e.principal, 'capital')),
      startedOn: e.startedOn,
      installments: Math.max(1, Math.floor(e.installments)),
      monthlyPayment: numeroOuNulo(e.monthlyPayment),
      tan: numeroOuNulo(e.tan) ?? 0,
      taeg: numeroOuNulo(e.taeg),
      mtic: numeroOuNulo(e.mtic),
      notes: texto(e.notes, 1000),
      closedOn: e.closedOn ?? null,
    };
  }

  /** O que a base guardou, mais tudo o que se calcula a partir disso. */
  private comAsContas(c: {
    id: string; name: string; lender: string | null;
    principal: unknown; startedOn: Date; installments: number;
    monthlyPayment: unknown; tan: unknown; taeg: unknown; mtic: unknown;
    notes: string | null; closedOn: Date | null;
  }, hoje: Date) {
    const base = {
      capital: Number(c.principal),
      tan: Number(c.tan),
      prestacoes: c.installments,
      inicio: c.startedOn,
    };

    const estado = estadoDoCredito(base, hoje);
    const doContrato = c.monthlyPayment === null ? null : Number(c.monthlyPayment);

    // A prestação que vale para as somas: a do contrato quando existe, senão
    // a calculada. A do contrato é a que sai da conta de facto.
    const prestacaoEmVigor = doContrato
      ?? estado.proximoPagamento?.prestacao
      ?? 0;

    return {
      id: c.id,
      nome: c.name,
      credor: c.lender,
      capital: base.capital,
      inicio: c.startedOn,
      prestacoes: c.installments,
      prestacaoDoContrato: doContrato,
      prestacaoEmVigor,
      tan: base.tan,
      taeg: c.taeg === null ? null : Number(c.taeg),
      mtic: c.mtic === null ? null : Number(c.mtic),
      notas: c.notes,
      liquidado: c.closedOn !== null,
      liquidadoEm: c.closedOn,
      estado,
      porAno: jurosPorAno(base),
      /**
       * A prestação do contrato bate certo com as contas?
       *
       * `null` quando ele não a escreveu. Quando escreveu e não bate, a tela
       * avisa: há um engano a copiar o contrato, e o quadro inteiro está
       * errado sem nada no ecrã a denunciá-lo.
       */
      conferencia: doContrato === null ? null : prestacaoBateCerto(base, doContrato),
    };
  }
}

export const personalService = new PersonalService();
