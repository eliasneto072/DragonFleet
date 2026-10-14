// src/modules/company/company.service.ts
//
// As contas da empresa: lucro, caixa e despesas.
//
// ─── DE ONDE VEM CADA NÚMERO ────────────────────────────────────────────────
//
// · A RECEITA vem dos fechos semanais REGISTADOS. Registados e não todos: um
//   rascunho ainda pode mudar, e contar dinheiro que ainda não foi creditado
//   dava um lucro que baixava sozinho quando alguém corrigisse um fecho.
//
// · AS DESPESAS vêm daqui, desta tabela nova.
//
// · O QUE É DOS MOTORISTAS vem da vista `driver_balances`, que é a mesma fonte
//   que o painel Financeiro já usa. Uma segunda conta do mesmo número acabaria
//   por divergir da primeira, e aí há dois ecrãs a dizer coisas diferentes
//   sobre o mesmo dinheiro.
//
// · O SALDO DO BANCO é declarado. A aplicação não vê o banco — ver a nota em
//   `lucro.ts` e no modelo `CompanyCashMark`.

import { prisma } from '../../config/prisma';
import { frotaObrigatoria } from '../../config/escopo';
import { AppError } from '../../shared/errors/AppError';
import { SettlementStatus } from '../../shared/types/enums';
import {
  calcularLucro, lucroPorMes, calcularCaixa,
  type FechoParaLucro, type DespesaDaEmpresa,
} from './lucro';

export interface Periodo {
  de?: Date | null;
  ate?: Date | null;
}

export type Actor = { id: string };

export interface EntradaDeDespesa {
  categoryId?: string | null;
  amount: number;
  spentOn: Date;
  supplier?: string | null;
  notes?: string | null;
  receiptUrl?: string | null;
  receiptKey?: string | null;
}

function noPeriodo(campo: string, p?: Periodo) {
  if (!p?.de && !p?.ate) return {};
  return {
    [campo]: {
      ...(p.de ? { gte: p.de } : {}),
      // `lte` e não `lt`: o último dia CONTA.
      ...(p.ate ? { lte: p.ate } : {}),
    },
  };
}

function texto(v: string | null | undefined, max = 200): string | null {
  const t = (v ?? '').trim();
  return t ? t.slice(0, max) : null;
}

class CompanyService {
  // ────────────────────────────────────────────────────────────────── LUCRO ──

  /** Os fechos registados do período, reduzidos ao que a conta precisa. */
  private async fechosDoPeriodo(p?: Periodo): Promise<FechoParaLucro[]> {
    const linhas = await prisma.weeklySettlement.findMany({
      where: {
        status: SettlementStatus.REGISTERED,
        ...noPeriodo('weekStart', p),
      },
      select: {
        vehicleFee: true,
        otherDeductions: true,
        commissionAmount: true,
        netToDriver: true,
        weekStart: true,
        user: { select: { isCompany: true } },
      },
    });

    return linhas.map((s) => ({
      doDono: s.user.isCompany,
      aluguer: Number(s.vehicleFee),
      outrasDeducoes: Number(s.otherDeductions),
      comissao: Number(s.commissionAmount),
      liquidoDoMotorista: Number(s.netToDriver),
      quando: s.weekStart,
    }));
  }

  private async despesasDoPeriodo(p?: Periodo): Promise<DespesaDaEmpresa[]> {
    const linhas = await prisma.companyExpense.findMany({
      where: { ...noPeriodo('spentOn', p) },
      select: { amount: true, spentOn: true, categoryId: true },
    });
    return linhas.map((d) => ({
      valor: Number(d.amount), quando: d.spentOn, categoriaId: d.categoryId,
    }));
  }

  async lucro(p?: Periodo) {
    const [fechos, despesas] = await Promise.all([
      this.fechosDoPeriodo(p), this.despesasDoPeriodo(p),
    ]);

    const categorias = await prisma.companyExpenseCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const nomes = new Map(categorias.map((c) => [c.id, c.name]));

    // Por categoria, da maior para a menor: é a ordem em que a pergunta «onde
    // é que se foi o dinheiro» se responde.
    const porCategoria = new Map<string | null, number>();
    for (const d of despesas) {
      const k = d.categoriaId ?? null;
      porCategoria.set(k, (porCategoria.get(k) ?? 0) + Math.abs(Math.round(d.valor * 100)));
    }

    return {
      ...calcularLucro(fechos, despesas),
      porMes: lucroPorMes(fechos, despesas),
      porCategoria: [...porCategoria.entries()]
        .map(([id, c]) => ({
          categoriaId: id,
          nome: id === null ? 'Sem categoria' : nomes.get(id) ?? 'Apagada',
          total: c / 100,
        }))
        .sort((a, b) => b.total - a.total),
    };
  }

  // ────────────────────────────────────────────────────────────────── CAIXA ──

  /**
   * O que a empresa tem, e quanto disso é dos motoristas.
   *
   * O «dos motoristas» sai da vista `driver_balances` — a mesma fonte do
   * painel Financeiro. Recalculá-lo aqui dava um segundo número que, mais
   * cedo ou mais tarde, deixava de bater com o primeiro.
   */
  async caixa(hoje: Date = new Date()) {
    const frota = frotaObrigatoria();

    const [marca, devido] = await Promise.all([
      prisma.companyCashMark.findFirst({
        orderBy: [{ observedOn: 'desc' }, { createdAt: 'desc' }],
        select: { balance: true, observedOn: true, notes: true },
      }),
      prisma.$queryRaw<{ total: string }[]>`
        SELECT COALESCE(SUM(available), 0)::text AS total
        FROM driver_balances
        WHERE fleet_id = ${frota} AND available > 0
      `,
    ]);

    const dosMotoristas = Number(devido[0]?.total ?? 0);

    return {
      ...calcularCaixa(
        marca ? { valor: Number(marca.balance), quando: marca.observedOn } : null,
        dosMotoristas,
        hoje,
      ),
      nota: marca?.notes ?? null,
    };
  }

  async historicoDeCaixa() {
    const linhas = await prisma.companyCashMark.findMany({
      orderBy: { observedOn: 'desc' },
      take: 60,
      select: { id: true, balance: true, observedOn: true, notes: true },
    });
    return linhas.map((m) => ({
      id: m.id, saldo: Number(m.balance), quando: m.observedOn, nota: m.notes,
    }));
  }

  /**
   * Declara o saldo do banco num dia.
   *
   * Uma declaração por dia (a base garante-o). Declarar outra vez no mesmo dia
   * CORRIGE a desse dia em vez de falhar: a segunda vez que alguém escreve o
   * saldo de hoje é quase sempre porque se enganou na primeira.
   */
  async declararSaldo(actor: Actor, saldo: number, quando: Date, nota?: string | null) {
    if (!Number.isFinite(saldo)) {
      throw new AppError('O saldo não é um número.', 400, 'INVALID_AMOUNT');
    }
    const valor = Math.round(saldo * 100) / 100;

    const jaHa = await prisma.companyCashMark.findFirst({
      where: { observedOn: quando }, select: { id: true },
    });

    if (jaHa) {
      return prisma.companyCashMark.update({
        where: { id: jaHa.id },
        data: { balance: valor, notes: texto(nota, 500), createdById: actor.id },
      });
    }

    return prisma.companyCashMark.create({
      data: {
        balance: valor, observedOn: quando,
        notes: texto(nota, 500), createdById: actor.id,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────── DESPESAS ──

  async listarDespesas(p?: Periodo) {
    const linhas = await prisma.companyExpense.findMany({
      where: { ...noPeriodo('spentOn', p) },
      orderBy: [{ spentOn: 'desc' }, { createdAt: 'desc' }],
      include: {
        category: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
      },
    });

    return linhas.map((d) => ({
      id: d.id,
      categoria: d.category,
      valor: Number(d.amount),
      quando: d.spentOn,
      fornecedor: d.supplier,
      notas: d.notes,
      recibo: d.receiptUrl,
      lancadaPor: d.createdBy?.name ?? null,
    }));
  }

  async criarDespesa(actor: Actor, e: EntradaDeDespesa) {
    const valor = Math.abs(Math.round(e.amount * 100) / 100);
    if (!Number.isFinite(valor) || valor === 0) {
      throw new AppError('O valor da despesa não pode ser zero.', 400, 'AMOUNT_REQUIRED');
    }
    await this.categoriaOuNula(e.categoryId);

    return prisma.companyExpense.create({
      data: {
        categoryId: e.categoryId ?? null,
        amount: valor,
        spentOn: e.spentOn,
        supplier: texto(e.supplier, 120),
        notes: texto(e.notes, 500),
        receiptUrl: e.receiptUrl ?? null,
        receiptKey: e.receiptKey ?? null,
        createdById: actor.id,
      },
    });
  }

  async actualizarDespesa(_actor: Actor, id: string, e: EntradaDeDespesa) {
    await this.despesaOuErro(id);
    const valor = Math.abs(Math.round(e.amount * 100) / 100);
    if (!Number.isFinite(valor) || valor === 0) {
      throw new AppError('O valor da despesa não pode ser zero.', 400, 'AMOUNT_REQUIRED');
    }
    await this.categoriaOuNula(e.categoryId);

    return prisma.companyExpense.update({
      where: { id },
      data: {
        categoryId: e.categoryId ?? null,
        amount: valor,
        spentOn: e.spentOn,
        supplier: texto(e.supplier, 120),
        notes: texto(e.notes, 500),
        ...(e.receiptUrl !== undefined
          ? { receiptUrl: e.receiptUrl, receiptKey: e.receiptKey ?? null }
          : {}),
      },
    });
  }

  async apagarDespesa(_actor: Actor, id: string) {
    await this.despesaOuErro(id);
    await prisma.companyExpense.delete({ where: { id } });
  }

  // ───────────────────────────────────────────────────────────── CATEGORIAS ──

  async listarCategorias() {
    return prisma.companyExpenseCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async criarCategoria(nome: string) {
    const name = texto(nome, 60);
    if (!name) throw new AppError('Dê um nome à categoria.', 400, 'NAME_REQUIRED');

    const repetida = await prisma.companyExpenseCategory.findFirst({
      where: { name }, select: { id: true },
    });
    if (repetida) {
      throw new AppError('Já existe uma categoria com esse nome.', 409, 'CATEGORY_EXISTS');
    }

    const quantas = await prisma.companyExpenseCategory.count();
    return prisma.companyExpenseCategory.create({ data: { name, sortOrder: quantas } });
  }

  /**
   * Apagar uma categoria não apaga as despesas.
   *
   * Ficam sem categoria (a chave estrangeira põe-nas a nulo) e continuam a
   * contar no lucro. Levá-las atrás mudava o lucro histórico por causa de uma
   * arrumação — e um lucro que muda sozinho é indistinguível de uma avaria.
   */
  async apagarCategoria(id: string) {
    const c = await prisma.companyExpenseCategory.findFirst({
      where: { id }, select: { id: true },
    });
    if (!c) throw new AppError('Categoria não encontrada.', 404, 'CATEGORY_NOT_FOUND');
    await prisma.companyExpenseCategory.delete({ where: { id } });
  }

  private async categoriaOuNula(id?: string | null) {
    if (!id) return;
    const c = await prisma.companyExpenseCategory.findFirst({
      where: { id }, select: { id: true },
    });
    if (!c) throw new AppError('Categoria não encontrada.', 404, 'CATEGORY_NOT_FOUND');
  }

  private async despesaOuErro(id: string) {
    const d = await prisma.companyExpense.findFirst({ where: { id }, select: { id: true } });
    if (!d) throw new AppError('Despesa não encontrada.', 404, 'EXPENSE_NOT_FOUND');
    return d;
  }
}

export const companyService = new CompanyService();
