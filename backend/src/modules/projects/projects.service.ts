// src/modules/projects/projects.service.ts
//
// Projetos de investimento: um carro financiado por investidores, que repartem
// o que ele der todos os meses.
//
// As contas estão em `projects.math.ts` (puras, testadas à parte). Aqui só se
// vai buscar dados, se verifica quem pode fazer o quê, e se grava — sempre
// dentro de uma transação quando há dinheiro a mexer.
//
// ─── O CICLO DE VIDA ────────────────────────────────────────────────────────
//
//   DRAFT     a preparar; os investidores não o veem
//     ↓ abrir
//   FUNDING   aberto a subscrições; o capital de quem entra fica trancado
//     ↓ ativar (precisa de um carro escolhido)
//   ACTIVE    todos os meses: apurar → distribuir
//     ↓ fechar (com o valor da venda, ou sem ele se foi por prazo)
//   CLOSED    o capital volta ao disponível, com a mais-valia ou a perda
//
// De FUNDING ou DRAFT também se pode CANCELAR: o capital é libertado e ninguém
// perde nada.
//
// ─── O QUE TRANCA O DINHEIRO ────────────────────────────────────────────────
//
// Uma participação ACTIVE sai do `available_capital` da conta do investidor
// mas continua a contar como `capital` — a empresa continua a devê-lo. Quem
// faz essa distinção é a view `investor_balances`, não este ficheiro. É por
// isso que não há nenhum movimento de saída ao subscrever: o dinheiro não saiu
// da conta, só deixou de estar livre.
//
// ─── AS DISTRIBUIÇÕES NÃO AMORTIZAM O CAPITAL ───────────────────────────────
//
// Decisão explícita do cliente. Quem pôs 10 000 € continua com 10 000 € em
// dívida depois de já ter recebido 10 000 € de lucros. Está repetido em três
// sítios de propósito: toda a gente assume o contrário.

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';
import { UserRole } from '../../shared/types/enums';
import {
  allocate, checkSubscription, computeLiquidation, computePeriod,
  dateToMonth, monthOf, monthStart, monthsBetween, nextMonthStart, round2,
} from './projects.math';

type Actor = { id: string; role?: UserRole };
type Tx = Prisma.TransactionClient;

/**
 * A forma mínima de uma participação para as contas do dinheiro.
 *
 * Declarada à mão e usada para anotar o que vem do Prisma: sem a anotação, o
 * tipo de `findMany` dentro de uma transação é inferido de forma diferente
 * consoante o contexto, e o que aqui se quer garantir é que estes três campos
 * existem — são os únicos de que a repartição precisa.
 */
type ShareRow = {
  id: string;
  accountId: string;
  amount: Prisma.Decimal | number;
};

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const mesLegivel = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;

const num = (v: unknown): number => (v == null ? 0 : Number(v));

function isAdmin(role?: UserRole) {
  return role === UserRole.ADMIN;
}
function podeVer(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.SUPPORT;
}
function exigirAdmin(actor: Actor) {
  if (!isAdmin(actor.role)) {
    throw new AppError('Apenas a administração pode fazer isto.', 403, 'FORBIDDEN');
  }
}

/**
 * Quem pode sequer ver esta parte do sistema.
 *
 * Gestão, ou alguém com conta de investidor. Um MOTORISTA não entra: os
 * projetos são um produto oferecido a investidores, e a lista de carros que a
 * empresa anda a financiar não é assunto de quem os conduz. As aplicações dos
 * motoristas são outro módulo (`investments`), com regras próprias.
 */
async function exigirAcesso(actor: Actor) {
  if (podeVer(actor.role)) return null;
  const conta = await prisma.investorAccount.findUnique({ where: { userId: actor.id } });
  if (!conta) throw new AppError('Acesso restrito.', 403, 'FORBIDDEN');
  return conta;
}

/** A conta de investidor de quem está a pedir. */
async function contaDe(actor: Actor) {
  const conta = await prisma.investorAccount.findUnique({ where: { userId: actor.id } });
  if (!conta) throw new AppError('Não existe conta de investidor.', 404, 'NO_INVESTOR_ACCOUNT');
  if (conta.status !== 'ACTIVE') {
    throw new AppError('Esta conta está fechada.', 409, 'ACCOUNT_CLOSED');
  }
  return conta;
}

export class ProjectsService {
  // ══ Leitura ══════════════════════════════════════════════════════════════

  /** Quanto já foi angariado num projeto. */
  private async raised(projectId: string, tx: Tx | typeof prisma = prisma): Promise<number> {
    const r = await tx.projectShare.aggregate({
      where: { projectId, status: 'ACTIVE' },
      _sum: { amount: true },
    });
    return round2(num(r._sum.amount));
  }

  /**
   * A lista de projetos.
   *
   * Para um investidor, só os que estão abertos ou a correr — um rascunho é
   * trabalho em curso e mostrá-lo geraria perguntas sobre um carro que ainda
   * pode não existir. Ele vê também os fechados em que participou, senão o
   * histórico dele desaparecia do ecrã no dia em que o projeto liquida.
   */
  async list(actor: Actor, filter: { status?: string; search?: string } = {}) {
    const gestao = podeVer(actor.role);
    const conta = await exigirAcesso(actor);

    const where: Prisma.InvestmentProjectWhereInput = {};
    if (filter.status) where.status = filter.status as never;
    if (filter.search?.trim()) {
      where.name = { contains: filter.search.trim(), mode: 'insensitive' };
    }
    if (!gestao) {
      where.OR = [
        { status: { in: ['FUNDING', 'ACTIVE'] } },
        ...(conta ? [{ shares: { some: { accountId: conta.id } } }] : []),
      ];
    }

    const rows = await prisma.investmentProject.findMany({
      where,
      include: {
        vehicle: { select: { id: true, brand: true, model: true, plate: true } },
        shares: { where: { status: 'ACTIVE' }, select: { amount: true, accountId: true } },
        periods: {
          where: { status: 'DISTRIBUTED' },
          select: { investorsAmount: true },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return rows.map((p) => {
      const raised = round2(p.shares.reduce((s, x) => s + Number(x.amount), 0));
      const distributed = round2(p.periods.reduce((s, x) => s + Number(x.investorsAmount), 0));
      const minha = conta
        ? round2(p.shares.filter((s) => s.accountId === conta.id)
            .reduce((s, x) => s + Number(x.amount), 0))
        : 0;

      return {
        ...toPublic(p),
        raised,
        investorsCount: new Set(p.shares.map((s) => s.accountId)).size,
        distributed,
        myAmount: minha,
      };
    });
  }

  async get(actor: Actor, id: string) {
    const gestao = podeVer(actor.role);
    const conta = await exigirAcesso(actor);

    const p = await prisma.investmentProject.findUnique({
      where: { id },
      include: {
        vehicle: { select: { id: true, brand: true, model: true, plate: true } },
        periods: { orderBy: { month: 'desc' } },
        expenses: gestao ? { orderBy: { month: 'desc' } } : false,
        // O investidor só vê as entradas marcadas como visíveis; a gestão vê
        // tudo, incluindo as notas internas.
        updates: {
          where: gestao ? {} : { visible: true },
          orderBy: [{ happenedOn: 'desc' }, { createdAt: 'desc' }],
        },
        shares: {
          include: gestao
            ? { account: { include: { user: { select: { id: true, name: true, email: true } } } } }
            : undefined,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!p) throw new AppError('Projeto não encontrado.', 404, 'PROJECT_NOT_FOUND');

    // Um investidor não vê um rascunho, a não ser que já participe nele.
    if (!gestao) {
      const participa = conta && p.shares.some((s) => s.accountId === conta.id);
      if (!['FUNDING', 'ACTIVE'].includes(p.status) && !participa) {
        throw new AppError('Projeto não encontrado.', 404, 'PROJECT_NOT_FOUND');
      }
    }

    const ativas = p.shares.filter((s) => s.status === 'ACTIVE');
    const raised = round2(ativas.reduce((s, x) => s + Number(x.amount), 0));

    const minhas = conta ? p.shares.filter((s) => s.accountId === conta.id) : [];
    const minhaAtiva = round2(
      minhas.filter((s) => s.status === 'ACTIVE').reduce((s, x) => s + Number(x.amount), 0),
    );

    // Quanto é que ELE já recebeu deste projeto. A pergunta que o investidor
    // faz primeiro, e que sem isto obrigava a percorrer o extrato à mão.
    const meuRecebido = conta
      ? await prisma.investorMovement.aggregate({
          where: { accountId: conta.id, projectId: id, kind: 'PROFIT_SHARE' },
          _sum: { amount: true },
        })
      : null;

    // Com ou sem motorista, e desde quando. É a pergunta que o investidor faz
    // a seguir a "onde está o carro" — um carro parado não rende.
    //
    // Sem o NOME do motorista: o investidor é alguém de fora da empresa e não
    // tem nada que saber quem conduz. Saber se há alguém ao volante chega-lhe.
    const motorista = p.vehicleId
      ? await prisma.vehicleAssignment.findFirst({
          where: { vehicleId: p.vehicleId, endedAt: null },
          orderBy: { startedAt: 'desc' },
          select: { startedAt: true },
        })
      : null;

    return {
      project: {
        ...toPublic(p),
        raised,
        investorsCount: new Set(ativas.map((s) => s.accountId)).size,
        distributed: round2(
          p.periods.filter((x) => x.status === 'DISTRIBUTED')
            .reduce((s, x) => s + Number(x.investorsAmount), 0),
        ),
      },
      periods: p.periods.map(periodPublic),
      updates: (p.updates ?? []).map(updatePublic),
      driver: {
        active: !!motorista,
        since: motorista ? motorista.startedAt.toISOString().slice(0, 10) : null,
      },
      // As participações de toda a gente só para a gestão. Um investidor vê a
      // sua e o número de participantes, não os nomes dos outros.
      shares: gestao
        ? p.shares.map((s) => ({
            id: s.id,
            accountId: s.accountId,
            amount: round2(Number(s.amount)),
            status: s.status,
            liquidatedAmount: s.liquidatedAmount == null ? null : round2(Number(s.liquidatedAmount)),
            createdAt: s.createdAt.toISOString(),
            investor: (s as unknown as {
              account?: { user: { id: string; name: string; email: string } };
            }).account?.user ?? null,
          }))
        : [],
      expenses: gestao
        ? (p.expenses ?? []).map((e) => ({
            id: e.id,
            month: dateToMonth(e.month),
            amount: round2(Number(e.amount)),
            description: e.description,
          }))
        : [],
      mine: conta
        ? {
            amount: minhaAtiva,
            ratio: raised > 0 ? minhaAtiva / raised : 0,
            received: round2(num(meuRecebido?._sum.amount)),
            liquidated: round2(
              minhas.filter((s) => s.status === 'LIQUIDATED')
                .reduce((s, x) => s + Number(x.liquidatedAmount ?? 0), 0),
            ),
          }
        : null,
    };
  }

  // ══ Administração — o projeto ════════════════════════════════════════════

  async create(actor: Actor, input: {
    name: string; description?: string; targetAmount: number; minTicket?: number;
    profitShare?: number; vehicleId?: string | null; riskLevel?: string;
    fundingClosesOn?: string; endsOn?: string;
    includeCommission?: boolean; includeVehicleFee?: boolean;
  }) {
    exigirAdmin(actor);
    if (!(input.targetAmount > 0)) {
      throw new AppError('A meta tem de ser maior do que zero.', 400, 'INVALID_TARGET');
    }

    const p = await prisma.investmentProject.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        targetAmount: new Prisma.Decimal(round2(input.targetAmount)),
        minTicket: new Prisma.Decimal(round2(input.minTicket ?? 0)),
        profitShare: new Prisma.Decimal(input.profitShare ?? 50),
        vehicleId: input.vehicleId || null,
        riskLevel: input.riskLevel?.trim() || null,
        fundingClosesOn: input.fundingClosesOn ? new Date(`${input.fundingClosesOn}T00:00:00Z`) : null,
        endsOn: input.endsOn ? new Date(`${input.endsOn}T00:00:00Z`) : null,
        includeCommission: input.includeCommission ?? true,
        includeVehicleFee: input.includeVehicleFee ?? true,
      },
    });
    return toPublic(p);
  }

  async update(actor: Actor, id: string, input: Record<string, unknown>) {
    exigirAdmin(actor);
    const p = await prisma.investmentProject.findUnique({ where: { id } });
    if (!p) throw new AppError('Projeto não encontrado.', 404, 'PROJECT_NOT_FOUND');

    // A meta e o mínimo deixam de se poder mexer assim que há dinheiro lá
    // dentro: baixar a meta abaixo do que já foi angariado deixava o projeto
    // sobre-financiado, e a fração de propriedade dos investidores mudava sem
    // ninguém decidir isso.
    const raised = await this.raised(id);
    if (raised > 0 && input.targetAmount !== undefined
        && round2(Number(input.targetAmount)) !== round2(Number(p.targetAmount))) {
      throw new AppError(
        `Já foram angariados ${eur(raised)}. A meta não pode mudar depois de haver subscrições.`,
        409, 'TARGET_LOCKED',
      );
    }

    const data: Prisma.InvestmentProjectUpdateInput = {};
    if (typeof input.name === 'string') data.name = input.name.trim();
    if (input.description !== undefined) {
      data.description = String(input.description ?? '').trim() || null;
    }
    if (input.targetAmount !== undefined) {
      data.targetAmount = new Prisma.Decimal(round2(Number(input.targetAmount)));
    }
    if (input.minTicket !== undefined) {
      data.minTicket = new Prisma.Decimal(round2(Number(input.minTicket)));
    }
    if (input.profitShare !== undefined) {
      data.profitShare = new Prisma.Decimal(Number(input.profitShare));
    }
    if (input.vehicleId !== undefined) {
      data.vehicle = input.vehicleId
        ? { connect: { id: String(input.vehicleId) } }
        : { disconnect: true };
    }
    if (input.riskLevel !== undefined) {
      data.riskLevel = String(input.riskLevel ?? '').trim() || null;
    }
    if (input.endsOn !== undefined) {
      data.endsOn = input.endsOn ? new Date(`${String(input.endsOn)}T00:00:00Z`) : null;
    }
    if (input.fundingClosesOn !== undefined) {
      data.fundingClosesOn = input.fundingClosesOn
        ? new Date(`${String(input.fundingClosesOn)}T00:00:00Z`) : null;
    }
    if (input.includeCommission !== undefined) data.includeCommission = !!input.includeCommission;
    if (input.includeVehicleFee !== undefined) data.includeVehicleFee = !!input.includeVehicleFee;
    if (input.imageUrl !== undefined) data.imageUrl = String(input.imageUrl ?? '') || null;

    const atualizado = await prisma.investmentProject.update({ where: { id }, data });
    return toPublic(atualizado);
  }

  /** Abre as subscrições. */
  async openFunding(actor: Actor, id: string) {
    exigirAdmin(actor);
    const p = await prisma.investmentProject.findUnique({ where: { id } });
    if (!p) throw new AppError('Projeto não encontrado.', 404, 'PROJECT_NOT_FOUND');
    if (p.status !== 'DRAFT') {
      throw new AppError('Só um rascunho pode abrir a subscrições.', 409, 'BAD_STATUS');
    }
    const atualizado = await prisma.investmentProject.update({
      where: { id }, data: { status: 'FUNDING' },
    });
    return toPublic(atualizado);
  }

  /**
   * Põe o projeto a render.
   *
   * Exige um carro escolhido: sem ele não há de onde apurar o lucro, e um
   * projeto ativo que não consegue apurar nada é um projeto que ninguém
   * consegue pagar.
   */
  async activate(actor: Actor, id: string, input: { startedOn?: string } = {}) {
    exigirAdmin(actor);
    const p = await prisma.investmentProject.findUnique({ where: { id } });
    if (!p) throw new AppError('Projeto não encontrado.', 404, 'PROJECT_NOT_FOUND');
    if (p.status !== 'FUNDING') {
      throw new AppError('Só um projeto em angariação pode arrancar.', 409, 'BAD_STATUS');
    }
    if (!p.vehicleId) {
      throw new AppError(
        'Escolha o carro do projeto antes de o pôr a render — é dele que sai o lucro.',
        409, 'VEHICLE_REQUIRED',
      );
    }

    const raised = await this.raised(id);
    if (raised <= 0) {
      throw new AppError('Ainda não há subscrições neste projeto.', 409, 'NO_SHARES');
    }

    const mes = input.startedOn ?? monthOf(new Date());
    const atualizado = await prisma.investmentProject.update({
      where: { id },
      data: { status: 'ACTIVE', startedOn: monthStart(mes) },
    });

    await this.avisarParticipantes(
      id,
      'Projeto a render',
      `O projeto "${p.name}" arrancou. A partir de ${mesLegivel(mes)} começa a distribuir os lucros.`,
    );

    return toPublic(atualizado);
  }

  /** Aborta antes de arrancar. O capital é libertado. */
  async cancel(actor: Actor, id: string, motivo?: string) {
    exigirAdmin(actor);
    const p = await prisma.investmentProject.findUnique({ where: { id } });
    if (!p) throw new AppError('Projeto não encontrado.', 404, 'PROJECT_NOT_FOUND');
    if (!['DRAFT', 'FUNDING'].includes(p.status)) {
      throw new AppError(
        'Um projeto que já arrancou não se cancela — fecha-se, com o valor da venda.',
        409, 'BAD_STATUS',
      );
    }

    await prisma.$transaction([
      prisma.projectShare.updateMany({
        where: { projectId: id, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      }),
      prisma.investmentProject.update({
        where: { id }, data: { status: 'CANCELLED', closedOn: new Date() },
      }),
    ]);

    await this.avisarParticipantes(
      id,
      'Projeto cancelado',
      `O projeto "${p.name}" foi cancelado${motivo ? `: ${motivo}` : ''}. `
      + 'O valor que tinha subscrito voltou ao seu saldo disponível.',
    );

    return this.get(actor, id);
  }

  // ══ Administração — os meses ═════════════════════════════════════════════

  /**
   * Apura um mês a partir dos fechos semanais do carro.
   *
   * Conta os fechos REGISTADOS cuja semana COMEÇA dentro do mês. É a regra
   * mais simples de explicar a quem confere — "as semanas que começaram em
   * março" — e não deixa nenhuma semana fora nem a conta duas vezes, que é o
   * que aconteceria a repartir semanas a cavalo entre dois meses.
   *
   * Recalcular um mês já DISTRIBUÍDO é recusado: o dinheiro já saiu.
   */
  async computeMonth(actor: Actor, id: string, month: string) {
    exigirAdmin(actor);

    const p = await prisma.investmentProject.findUnique({ where: { id } });
    if (!p) throw new AppError('Projeto não encontrado.', 404, 'PROJECT_NOT_FOUND');
    if (!p.vehicleId) {
      throw new AppError('Este projeto não tem carro escolhido.', 409, 'VEHICLE_REQUIRED');
    }

    const existente = await prisma.projectPeriod.findUnique({
      where: { projectId_month: { projectId: id, month: monthStart(month) } },
    });
    if (existente?.status === 'DISTRIBUTED') {
      throw new AppError(
        `${mesLegivel(month)} já foi distribuído. Para corrigir, lance um acerto.`,
        409, 'ALREADY_DISTRIBUTED',
      );
    }

    const [fechos] = await prisma.$queryRaw<{
      commission: number; vehicle_fee: number; n: number;
    }[]>`
      SELECT CAST(COALESCE(SUM(commission_amount), 0) AS FLOAT) AS commission,
             CAST(COALESCE(SUM(vehicle_fee), 0) AS FLOAT)       AS vehicle_fee,
             COUNT(*)::int                                      AS n
      FROM weekly_settlements
      WHERE vehicle_id = ${p.vehicleId}
        AND status = 'REGISTERED'
        AND week_start >= ${monthStart(month)}::date
        AND week_start <  ${nextMonthStart(month)}::date`;

    const despesas = await prisma.projectExpense.aggregate({
      where: { projectId: id, month: monthStart(month) },
      _sum: { amount: true },
    });

    const profitShare = Number(p.profitShare);
    const r = computePeriod({
      commissionTotal: num(fechos?.commission),
      vehicleFeeTotal: num(fechos?.vehicle_fee),
      expensesTotal: num(despesas._sum.amount),
      profitSharePct: profitShare,
      includeCommission: p.includeCommission,
      includeVehicleFee: p.includeVehicleFee,
    });

    const data = {
      commissionTotal: new Prisma.Decimal(round2(num(fechos?.commission))),
      vehicleFeeTotal: new Prisma.Decimal(round2(num(fechos?.vehicle_fee))),
      expensesTotal: new Prisma.Decimal(round2(num(despesas._sum.amount))),
      settlementsCount: Number(fechos?.n ?? 0),
      profit: new Prisma.Decimal(r.profit),
      investorsAmount: new Prisma.Decimal(r.investorsAmount),
      profitShare: new Prisma.Decimal(profitShare),
    };

    const periodo = await prisma.projectPeriod.upsert({
      where: { projectId_month: { projectId: id, month: monthStart(month) } },
      create: { projectId: id, month: monthStart(month), ...data },
      update: data,
    });

    return periodPublic(periodo);
  }

  /**
   * Apura todos os meses em falta de uma vez.
   *
   * Do mês de arranque até ao mês passado — o mês corrente não se apura porque
   * ainda lhe faltam semanas, e distribuir meio mês obrigaria depois a um
   * acerto que ninguém percebe.
   */
  async computePending(actor: Actor, id: string, now: Date = new Date()) {
    exigirAdmin(actor);
    const p = await prisma.investmentProject.findUnique({ where: { id } });
    if (!p?.startedOn) {
      throw new AppError('O projeto ainda não arrancou.', 409, 'NOT_STARTED');
    }

    const inicio = dateToMonth(p.startedOn);
    const anterior = new Date(`${monthOf(now)}-01T00:00:00Z`);
    anterior.setUTCMonth(anterior.getUTCMonth() - 1);
    const fim = anterior.toISOString().slice(0, 7);

    const feitos = new Set(
      (await prisma.projectPeriod.findMany({
        where: { projectId: id }, select: { month: true, status: true },
      })).filter((x) => x.status === 'DISTRIBUTED').map((x) => dateToMonth(x.month)),
    );

    const out = [];
    for (const m of monthsBetween(inicio, fim)) {
      if (feitos.has(m)) continue;
      out.push(await this.computeMonth(actor, id, m));
    }
    return out;
  }

  /**
   * Paga um mês aos investidores.
   *
   * Cria um movimento por participação, na conta de cada um, com o projeto e o
   * mês escritos na descrição. A soma das partes é exatamente o valor apurado —
   * o `allocate` trata dos cêntimos da divisão.
   *
   * Quem conta são as participações ATIVAS no momento do pagamento. Quem
   * entrou a meio do mês recebe o mês inteiro: é a regra mais simples de
   * explicar, e a alternativa — proporcional aos dias — obrigava a guardar a
   * data de cada entrada e a explicar frações de mês a quem pôs dinheiro no
   * dia 28.
   */
  async distribute(actor: Actor, id: string, month: string) {
    exigirAdmin(actor);

    return prisma.$transaction(async (tx) => {
      const p = await tx.investmentProject.findUnique({ where: { id } });
      if (!p) throw new AppError('Projeto não encontrado.', 404, 'PROJECT_NOT_FOUND');
      if (p.status !== 'ACTIVE') {
        throw new AppError('Só um projeto a render distribui lucros.', 409, 'BAD_STATUS');
      }

      const periodo = await tx.projectPeriod.findUnique({
        where: { projectId_month: { projectId: id, month: monthStart(month) } },
      });
      if (!periodo) {
        throw new AppError(`${mesLegivel(month)} ainda não foi apurado.`, 409, 'NOT_COMPUTED');
      }
      if (periodo.status === 'DISTRIBUTED') {
        throw new AppError(`${mesLegivel(month)} já foi distribuído.`, 409, 'ALREADY_DISTRIBUTED');
      }

      const total = round2(Number(periodo.investorsAmount));
      const shares: ShareRow[] = await tx.projectShare.findMany({
        where: { projectId: id, status: 'ACTIVE' },
      });

      if (total > 0 && shares.length > 0) {
        const partes = allocate(total, shares.map((s) => ({
          id: s.id, amount: Number(s.amount),
        })));
        const porId = new Map(shares.map((s) => [s.id, s] as const));

        await tx.investorMovement.createMany({
          data: partes
            // Uma parte de zero cêntimos não vale uma linha no extrato de
            // ninguém — acontece a quem tem uma participação muito pequena num
            // mês fraco.
            .filter((a) => a.amount > 0)
            .map((a) => ({
              accountId: porId.get(a.id)!.accountId,
              day: monthStart(month),
              kind: 'PROFIT_SHARE' as const,
              bucket: 'EARNINGS' as const,
              amount: new Prisma.Decimal(a.amount),
              projectId: id,
              description: `${p.name} · lucro de ${mesLegivel(month)}`
                + ` (${Math.round(a.ratio * 1000) / 10}% do projeto)`,
              createdBy: actor.id,
            })),
        });
      }

      const atualizado = await tx.projectPeriod.update({
        where: { id: periodo.id },
        data: { status: 'DISTRIBUTED', distributedAt: new Date() },
      });

      // As notificações vão fora da transação lógica do dinheiro mas dentro da
      // mesma: se falharem, é melhor desfazer tudo do que pagar sem avisar.
      const contas = [...new Set(shares.map((s) => s.accountId))];
      if (total > 0 && contas.length > 0) {
        const donos = await tx.investorAccount.findMany({
          where: { id: { in: contas } }, select: { userId: true },
        });
        await tx.notification.createMany({
          data: donos.map((d) => ({
            userId: d.userId,
            title: 'Lucro distribuído',
            message: `O projeto "${p.name}" distribuiu o lucro de ${mesLegivel(month)}.`
              + ' Veja a sua parte no extrato.',
          })),
        });
      }

      return periodPublic(atualizado);
    });
  }

  /**
   * Fecha o projeto e devolve o capital.
   *
   * Com `saleAmount`, reparte o valor da venda na proporção da fração que os
   * investidores financiaram — pode devolver mais ou menos do que entrou.
   * Sem ele, devolve o capital tal como entrou: é o caso do projeto que chega
   * ao prazo com o carro a continuar na frota.
   *
   * O movimento gravado é a DIFERENÇA e não o valor todo: o capital nunca saiu
   * da conta do investidor, estava apenas trancado. Lançar o valor inteiro
   * duplicava-o.
   */
  async close(actor: Actor, id: string, input: { saleAmount?: number | null; notes?: string }) {
    exigirAdmin(actor);

    return prisma.$transaction(async (tx) => {
      const p = await tx.investmentProject.findUnique({ where: { id } });
      if (!p) throw new AppError('Projeto não encontrado.', 404, 'PROJECT_NOT_FOUND');
      if (p.status !== 'ACTIVE') {
        throw new AppError('Só um projeto a render se pode fechar.', 409, 'BAD_STATUS');
      }

      const porDistribuir = await tx.projectPeriod.count({
        where: { projectId: id, status: 'DRAFT', investorsAmount: { gt: 0 } },
      });
      if (porDistribuir > 0) {
        throw new AppError(
          `Há ${porDistribuir} ${porDistribuir === 1 ? 'mês apurado' : 'meses apurados'} por distribuir.`
          + ' Pague-os antes de fechar, senão o lucro desses meses fica por pagar.',
          409, 'PENDING_PERIODS',
        );
      }

      const shares: ShareRow[] = await tx.projectShare.findMany({
        where: { projectId: id, status: 'ACTIVE' },
      });
      if (shares.length === 0) {
        throw new AppError('Não há participações ativas neste projeto.', 409, 'NO_SHARES');
      }

      const raised = round2(shares.reduce((s, x) => s + Number(x.amount), 0));
      const sale = input.saleAmount == null ? null : round2(input.saleAmount);

      const liq = computeLiquidation({
        targetAmount: Number(p.targetAmount),
        raisedAmount: raised,
        saleAmount: sale,
        shares: shares.map((s) => ({ id: s.id, amount: Number(s.amount) })),
      });

      const porId = new Map(shares.map((s) => [s.id, s] as const));

      for (const parte of liq.perShare) {
        const share = porId.get(parte.id)!;
        const posto = round2(Number(share.amount));
        const delta = round2(parte.amount - posto);

        // Só há movimento se houver diferença. O capital em si já estava na
        // conta: o que muda com a liquidação é deixar de estar trancado.
        if (delta !== 0) {
          await tx.investorMovement.create({
            data: {
              accountId: share.accountId,
              day: monthStart(monthOf(new Date())),
              kind: 'PROJECT_RESULT',
              bucket: 'CAPITAL',
              amount: new Prisma.Decimal(delta),
              projectId: id,
              description: `${p.name} · liquidação`
                + (sale === null ? ' (sem venda)' : ` · venda por ${eur(sale)}`)
                + ` · ${delta > 0 ? 'mais-valia' : 'perda'} de ${eur(Math.abs(delta))}`,
              createdBy: actor.id,
            },
          });
        }

        await tx.projectShare.update({
          where: { id: share.id },
          data: {
            status: 'LIQUIDATED',
            liquidatedAmount: new Prisma.Decimal(parte.amount),
            liquidatedAt: new Date(),
          },
        });
      }

      const atualizado = await tx.investmentProject.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closedOn: new Date(),
          saleAmount: sale === null ? null : new Prisma.Decimal(sale),
        },
      });

      const donos = await tx.investorAccount.findMany({
        where: { id: { in: [...new Set(shares.map((s) => s.accountId))] } },
        select: { userId: true },
      });
      await tx.notification.createMany({
        data: donos.map((d) => ({
          userId: d.userId,
          title: 'Projeto liquidado',
          message: `O projeto "${p.name}" foi fechado e o capital voltou ao seu saldo disponível.`
            + (input.notes?.trim() ? ` ${input.notes.trim()}` : ''),
        })),
      });

      return toPublic(atualizado);
    });
  }

  // ══ Despesas ═════════════════════════════════════════════════════════════

  async addExpense(actor: Actor, id: string, input: {
    month: string; amount: number; description: string;
  }) {
    exigirAdmin(actor);
    if (!(input.amount > 0)) {
      throw new AppError('O valor tem de ser maior do que zero.', 400, 'INVALID_AMOUNT');
    }
    if (!input.description?.trim()) {
      throw new AppError('Escreva o que foi esta despesa.', 400, 'REASON_REQUIRED');
    }

    const periodo = await prisma.projectPeriod.findUnique({
      where: { projectId_month: { projectId: id, month: monthStart(input.month) } },
    });
    if (periodo?.status === 'DISTRIBUTED') {
      throw new AppError(
        `${mesLegivel(input.month)} já foi distribuído — a despesa não pode entrar nesse mês.`,
        409, 'ALREADY_DISTRIBUTED',
      );
    }

    await prisma.projectExpense.create({
      data: {
        projectId: id,
        month: monthStart(input.month),
        amount: new Prisma.Decimal(round2(input.amount)),
        description: input.description.trim(),
        createdBy: actor.id,
      },
    });

    // Reapura logo o mês: uma despesa lançada que não mexe no número obrigava
    // a carregar noutro botão para a ver refletida, e alguém esqueceria.
    return this.computeMonth(actor, id, input.month);
  }

  async removeExpense(actor: Actor, expenseId: string) {
    exigirAdmin(actor);
    const d = await prisma.projectExpense.findUnique({ where: { id: expenseId } });
    if (!d) throw new AppError('Despesa não encontrada.', 404, 'EXPENSE_NOT_FOUND');

    const mes = dateToMonth(d.month);
    const periodo = await prisma.projectPeriod.findUnique({
      where: { projectId_month: { projectId: d.projectId, month: d.month } },
    });
    if (periodo?.status === 'DISTRIBUTED') {
      throw new AppError(
        `${mesLegivel(mes)} já foi distribuído — a despesa não pode sair desse mês.`,
        409, 'ALREADY_DISTRIBUTED',
      );
    }

    await prisma.projectExpense.delete({ where: { id: expenseId } });
    return this.computeMonth(actor, d.projectId, mes);
  }

  // ══ Diário de bordo ══════════════════════════════════════════════════════

  /**
   * Escreve uma entrada no diário.
   *
   * `happenedOn` é o dia a que a entrada se refere e não o dia em que é
   * escrita: o pagamento foi feito na sexta e registado na segunda, e a linha
   * do tempo tem de o mostrar na sexta.
   *
   * Notifica os participantes quando é visível. Uma entrada que ninguém dá por
   * ela não resolve o problema que este diário existe para resolver — que é o
   * investidor não ter de telefonar para saber o que se passa.
   */
  async addUpdate(actor: Actor, projectId: string, input: {
    stage?: string; title: string; body?: string; imageUrl?: string;
    happenedOn?: string; visible?: boolean;
  }) {
    exigirAdmin(actor);

    const p = await prisma.investmentProject.findUnique({ where: { id: projectId } });
    if (!p) throw new AppError('Projeto não encontrado.', 404, 'PROJECT_NOT_FOUND');
    if (!input.title?.trim()) {
      throw new AppError('Escreva um título para a entrada.', 400, 'TITLE_REQUIRED');
    }

    const dia = input.happenedOn ?? new Date().toISOString().slice(0, 10);
    const visivel = input.visible ?? true;

    const entrada = await prisma.projectUpdate.create({
      data: {
        projectId,
        stage: (input.stage ?? 'OTHER') as never,
        title: input.title.trim(),
        body: input.body?.trim() || null,
        imageUrl: input.imageUrl?.trim() || null,
        happenedOn: new Date(`${dia}T00:00:00Z`),
        visible: visivel,
        createdBy: actor.id,
      },
    });

    if (visivel) {
      await this.avisarParticipantes(
        projectId,
        `${p.name}: ${entrada.title}`,
        entrada.body?.slice(0, 200) ?? 'Há uma novidade no projeto.',
      );
    }

    return updatePublic(entrada);
  }

  async removeUpdate(actor: Actor, updateId: string) {
    exigirAdmin(actor);
    const e = await prisma.projectUpdate.findUnique({ where: { id: updateId } });
    if (!e) throw new AppError('Entrada não encontrada.', 404, 'UPDATE_NOT_FOUND');
    await prisma.projectUpdate.delete({ where: { id: updateId } });
    return { ok: true, projectId: e.projectId };
  }

  /** Mostra ou esconde uma entrada do diário aos investidores. */
  async toggleUpdate(actor: Actor, updateId: string) {
    exigirAdmin(actor);
    const e = await prisma.projectUpdate.findUnique({ where: { id: updateId } });
    if (!e) throw new AppError('Entrada não encontrada.', 404, 'UPDATE_NOT_FOUND');
    const atualizada = await prisma.projectUpdate.update({
      where: { id: updateId }, data: { visible: !e.visible },
    });
    return updatePublic(atualizada);
  }

  // ══ O investidor ═════════════════════════════════════════════════════════

  /**
   * Subscrever um projeto.
   *
   * Tranca a conta antes de ler o disponível: sem isso, duas subscrições
   * enviadas ao mesmo tempo passavam as duas e o investidor ficava com mais
   * aplicado do que tem.
   */
  async subscribe(actor: Actor, projectId: string, amount: number) {
    const conta = await contaDe(actor);

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM investor_accounts WHERE id = ${conta.id} FOR UPDATE`;
      // Também o projeto: duas pessoas a subscrever o que falta ao mesmo tempo
      // podiam ultrapassar a meta.
      const p = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM investment_projects WHERE id = ${projectId} FOR UPDATE`;
      if (!p[0]) throw new AppError('Projeto não encontrado.', 404, 'PROJECT_NOT_FOUND');

      const projeto = await tx.investmentProject.findUniqueOrThrow({ where: { id: projectId } });
      if (projeto.status !== 'FUNDING') {
        throw new AppError('Este projeto não está aberto a subscrições.', 409, 'NOT_FUNDING');
      }

      const [balance] = await tx.$queryRaw<{ available_capital: number }[]>`
        SELECT CAST(available_capital AS FLOAT) AS available_capital
        FROM investor_balances WHERE account_id = ${conta.id}`;

      const raised = await this.raised(projectId, tx);
      const check = checkSubscription({
        amount,
        minTicket: Number(projeto.minTicket),
        targetAmount: Number(projeto.targetAmount),
        raisedAmount: raised,
        available: num(balance?.available_capital),
      });

      if (!check.ok) {
        const mensagens: Record<string, string> = {
          NOT_POSITIVE: 'O valor tem de ser maior do que zero.',
          BELOW_MIN: `O mínimo neste projeto é ${eur(Number(projeto.minTicket))}.`,
          EXCEEDS_TARGET: `Faltam apenas ${eur(check.falta ?? 0)} para completar este projeto.`,
          INSUFFICIENT: `Só tem ${eur(num(balance?.available_capital))} de capital disponível.`,
        };
        throw new AppError(mensagens[check.reason], 409, check.reason);
      }

      const share = await tx.projectShare.create({
        data: {
          projectId,
          accountId: conta.id,
          amount: new Prisma.Decimal(check.amount),
        },
      });

      const novoTotal = round2(raised + check.amount);

      // O financiamento acabou de fechar com esta subscrição. Abre-se o diário
      // com a primeira entrada, aqui e não à mão: é o momento em que o
      // investidor passa a ter dinheiro parado à espera de um carro, e é
      // exatamente aí que ele quer começar a ver o que se passa.
      //
      // Dentro da transação de propósito: se isto falhar, a subscrição que
      // fechou o financiamento também não deve ficar registada — senão o
      // projeto ficava cheio sem ninguém dar por isso.
      if (novoTotal >= round2(Number(projeto.targetAmount))) {
        await tx.projectUpdate.create({
          data: {
            projectId,
            stage: 'FUNDING_COMPLETE',
            title: 'Financiamento concluído',
            body: `O projeto angariou os ${eur(novoTotal)} necessários. `
              + 'A partir daqui, cada passo — a entrada do dinheiro, a compra do carro, '
              + 'a legalização, a entrega ao motorista — fica registado nesta página.',
            happenedOn: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z'),
            createdBy: actor.id,
          },
        });

        const donos = await tx.investorAccount.findMany({
          where: {
            id: {
              in: [...new Set(
                (await tx.projectShare.findMany({
                  where: { projectId, status: 'ACTIVE' }, select: { accountId: true },
                })).map((x) => x.accountId),
              )],
            },
          },
          select: { userId: true },
        });
        await tx.notification.createMany({
          data: donos.map((d) => ({
            userId: d.userId,
            title: 'Financiamento concluído',
            message: `O projeto "${projeto.name}" está totalmente financiado. `
              + 'Acompanhe os próximos passos na página do projeto.',
          })),
        });
      }

      return {
        id: share.id,
        amount: check.amount,
        projectId,
        raised: novoTotal,
      };
    });
  }

  /** As participações do próprio, em todos os projetos. */
  async myShares(actor: Actor) {
    const conta = await prisma.investorAccount.findUnique({ where: { userId: actor.id } });
    if (!conta) throw new AppError('Não existe conta de investidor.', 404, 'NO_INVESTOR_ACCOUNT');

    const shares = await prisma.projectShare.findMany({
      where: { accountId: conta.id },
      include: { project: { select: { id: true, name: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const recebido = await prisma.investorMovement.groupBy({
      by: ['projectId'],
      where: { accountId: conta.id, kind: 'PROFIT_SHARE' },
      _sum: { amount: true },
    });
    const porProjeto = new Map(recebido.map((r) => [r.projectId, round2(num(r._sum.amount))]));

    return shares.map((s) => ({
      id: s.id,
      projectId: s.projectId,
      projectName: s.project.name,
      projectStatus: s.project.status,
      amount: round2(Number(s.amount)),
      status: s.status,
      received: porProjeto.get(s.projectId) ?? 0,
      liquidatedAmount: s.liquidatedAmount == null ? null : round2(Number(s.liquidatedAmount)),
      createdAt: s.createdAt.toISOString(),
    }));
  }

  // ══ Interno ══════════════════════════════════════════════════════════════

  private async avisarParticipantes(projectId: string, title: string, message: string) {
    try {
      const shares = await prisma.projectShare.findMany({
        where: { projectId },
        select: { account: { select: { userId: true } } },
      });
      const users = [...new Set(shares.map((s) => s.account.userId))];
      if (users.length === 0) return;
      await prisma.notification.createMany({
        data: users.map((userId) => ({ userId, title, message })),
      });
    } catch (err) {
      // Um aviso que falha não pode desfazer a operação que já correu.
      logger.error({ err, projectId }, 'Falha ao notificar participantes do projeto');
    }
  }
}

// ─── Formas públicas ────────────────────────────────────────────────────────

function toPublic(p: {
  id: string; name: string; description: string | null;
  targetAmount: Prisma.Decimal | number; minTicket: Prisma.Decimal | number;
  profitShare: Prisma.Decimal | number; vehicleId: string | null;
  includeCommission: boolean; includeVehicleFee: boolean; status: string;
  fundingClosesOn: Date | null; startedOn: Date | null; endsOn: Date | null;
  closedOn: Date | null; saleAmount: Prisma.Decimal | number | null;
  riskLevel: string | null; imageUrl: string | null; createdAt: Date;
  vehicle?: { id: string; brand: string; model: string; plate: string } | null;
}) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    targetAmount: round2(Number(p.targetAmount)),
    minTicket: round2(Number(p.minTicket)),
    profitShare: Number(p.profitShare),
    vehicleId: p.vehicleId,
    vehicle: p.vehicle ?? null,
    includeCommission: p.includeCommission,
    includeVehicleFee: p.includeVehicleFee,
    status: p.status as 'DRAFT' | 'FUNDING' | 'ACTIVE' | 'CLOSED' | 'CANCELLED',
    fundingClosesOn: p.fundingClosesOn ? p.fundingClosesOn.toISOString().slice(0, 10) : null,
    startedOn: p.startedOn ? dateToMonth(p.startedOn) : null,
    endsOn: p.endsOn ? p.endsOn.toISOString().slice(0, 10) : null,
    closedOn: p.closedOn ? p.closedOn.toISOString().slice(0, 10) : null,
    saleAmount: p.saleAmount == null ? null : round2(Number(p.saleAmount)),
    riskLevel: p.riskLevel,
    imageUrl: p.imageUrl,
    createdAt: p.createdAt.toISOString(),
  };
}

function updatePublic(x: {
  id: string; stage: string; title: string; body: string | null;
  imageUrl: string | null; happenedOn: Date; visible: boolean; createdAt: Date;
}) {
  return {
    id: x.id,
    stage: x.stage,
    title: x.title,
    body: x.body,
    imageUrl: x.imageUrl,
    happenedOn: x.happenedOn.toISOString().slice(0, 10),
    visible: x.visible,
    createdAt: x.createdAt.toISOString(),
  };
}

function periodPublic(x: {
  id: string; month: Date; commissionTotal: Prisma.Decimal | number;
  vehicleFeeTotal: Prisma.Decimal | number; expensesTotal: Prisma.Decimal | number;
  settlementsCount: number; profit: Prisma.Decimal | number;
  investorsAmount: Prisma.Decimal | number; profitShare: Prisma.Decimal | number;
  status: string; distributedAt: Date | null; notes: string | null;
}) {
  return {
    id: x.id,
    month: dateToMonth(x.month),
    commissionTotal: round2(Number(x.commissionTotal)),
    vehicleFeeTotal: round2(Number(x.vehicleFeeTotal)),
    expensesTotal: round2(Number(x.expensesTotal)),
    settlementsCount: x.settlementsCount,
    profit: round2(Number(x.profit)),
    investorsAmount: round2(Number(x.investorsAmount)),
    profitShare: Number(x.profitShare),
    status: x.status as 'DRAFT' | 'DISTRIBUTED',
    distributedAt: x.distributedAt ? x.distributedAt.toISOString() : null,
    notes: x.notes,
  };
}

export const projectsService = new ProjectsService();
