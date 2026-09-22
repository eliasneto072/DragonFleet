// src/modules/investments/investments.service.ts
//
// Planos de investimento, aplicações dos motoristas e o rendimento diário.
//
// As contas estão em `investments.math.ts` (puras, testadas à parte). Aqui só
// se vai buscar dados, se verifica quem pode fazer o quê, e se grava — sempre
// dentro de uma transação quando há dinheiro a mexer.
//
// ─── QUEM PODE O QUÊ ────────────────────────────────────────────────────────
//
//   ADMIN            cria e altera planos, muda taxas, vê tudo, pode resgatar
//                    uma aplicação em nome do titular
//   MANAGER/SUPPORT  vê planos e aplicações de toda a gente (o suporte recebe
//                    a pergunta "quanto tenho aplicado"); não mexe
//   DRIVER           vê os planos ativos, aplica do próprio saldo, vê e
//                    resgata as próprias aplicações
//
// ─── CONCORRÊNCIA ───────────────────────────────────────────────────────────
//
// Aplicar e resgatar trancam a linha do utilizador (`SELECT … FOR UPDATE`)
// antes de ler o saldo. Dois pedidos de aplicação simultâneos ficam em fila e
// o segundo já vê o saldo sem o primeiro — não se aplica o mesmo euro duas
// vezes. O pagamento diário e o resgate trancam a linha da APLICAÇÃO, para o
// job da madrugada e um resgate à mesma hora não pagarem o mesmo dia duas
// vezes (a restrição única por dia é a segunda rede).
//
// LIMITAÇÃO CONHECIDA: as retiradas (withdrawals.service) não trancam a linha
// do utilizador — está documentado lá. Uma retirada e uma aplicação feitas no
// mesmo milissegundo podem ainda passar as duas. Resolver isso é mexer nas
// retiradas, e fica para um pacote próprio.

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';
import {
  InvestmentPlanType, InvestmentStatus, UserRole,
} from '../../shared/types/enums';
import {
  accrualEnd, addDays, computePayout, dateToDay, dayToDate, lisbonDay,
  pendingAccruals, rateOn, round2, type Day, type PayoutResult, type RatePoint,
} from './investments.math';
import { ranksService } from '../ranks/ranks.service';
import { tierIndex, type Tier } from '../ranks/ranks.math';

type Actor = { id: string; role?: UserRole };
type Tx = Prisma.TransactionClient;

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

const fmtDay = (d: Day) => d.split('-').reverse().join('/');

function isAdmin(role?: UserRole) {
  return role === UserRole.ADMIN;
}

/** Vê tudo, não mexe. Mesma separação do resto do projeto. */
function podeVer(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.SUPPORT;
}

/** Quem pode ter aplicações. Hoje só motoristas; os investidores entram aqui. */
function podeAplicar(role?: UserRole) {
  return role === UserRole.DRIVER;
}

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));

// ─── Formas públicas ────────────────────────────────────────────────────────

export interface PlanPublic {
  id: string;
  name: string;
  description: string | null;
  type: InvestmentPlanType;
  /** A taxa em vigor HOJE. */
  annualRate: number;
  termDays: number | null;
  earlyWithdrawalPenalty: number | null;
  minAmount: number;
  /** Nível mínimo para aplicar. Nulo = aberto a todos. */
  minRank: Tier | null;
  /** Só na lista do motorista: ele já tem o nível exigido? */
  unlocked?: boolean;
  active: boolean;
  createdAt: Date;
  /** Só para a administração: quantas aplicações ativas e quanto está lá. */
  activeCount?: number;
  activePrincipal?: number;
}

export interface InvestmentPublic {
  id: string;
  userId: string;
  userName?: string;
  planId: string;
  planName: string;
  planType: InvestmentPlanType;
  principal: number;
  /** A taxa que se aplica hoje: a congelada (fixo) ou a do plano (flexível). */
  currentRate: number;
  termDays: number | null;
  penaltyRate: number | null;
  startDate: Day;
  maturityDate: Day | null;
  accruedThrough: Day | null;
  /** Ganhos acumulados, arredondados ao cêntimo para mostrar. */
  gains: number;
  /** principal + gains. */
  currentValue: number;
  /** Ganho de um dia à taxa de hoje, para o ecrã dizer "rende X por dia". */
  dailyGain: number;
  status: InvestmentStatus;
  closeReason: string | null;
  payout: number | null;
  penaltyAmount: number | null;
  createdAt: Date;
  closedAt: Date | null;
}

export interface InvestmentEvent {
  kind: 'DEPOSIT' | 'GAIN' | 'REDEMPTION';
  date: string;
  amount: number;
  annualRate?: number;
  detail?: string;
}

// ─── Leituras auxiliares ────────────────────────────────────────────────────

async function rateHistory(db: Tx, planId: string): Promise<RatePoint[]> {
  const rows = await db.investmentPlanRate.findMany({
    where: { planId },
    orderBy: { effectiveFrom: 'asc' },
    select: { effectiveFrom: true, annualRate: true },
  });
  return rows.map((r) => ({ effectiveFrom: dateToDay(r.effectiveFrom), annualRate: num(r.annualRate) }));
}

type InvestmentRow = Prisma.InvestmentGetPayload<{ include: { plan: true; user: { select: { name: true } } } }>;

function toPublic(row: InvestmentRow, history: RatePoint[], today: Day): InvestmentPublic {
  const principal = num(row.principal);
  const currentRate = row.planType === InvestmentPlanType.FIXED
    ? num(row.annualRate)
    : (history.length ? rateOn(history, today) : num(row.plan.annualRate));
  const gains = round2(num(row.accrued));

  return {
    id: row.id,
    userId: row.userId,
    userName: row.user?.name,
    planId: row.planId,
    planName: row.plan.name,
    planType: row.planType,
    principal,
    currentRate,
    termDays: row.termDays,
    penaltyRate: row.penaltyRate == null ? null : num(row.penaltyRate),
    startDate: dateToDay(row.startDate),
    maturityDate: row.maturityDate ? dateToDay(row.maturityDate) : null,
    accruedThrough: row.accruedThrough ? dateToDay(row.accruedThrough) : null,
    gains,
    currentValue: row.status === InvestmentStatus.ACTIVE ? round2(principal + gains) : 0,
    dailyGain: round2((principal * currentRate) / 100 / 365),
    status: row.status,
    closeReason: row.closeReason,
    payout: row.payout == null ? null : num(row.payout),
    penaltyAmount: row.penaltyAmount == null ? null : num(row.penaltyAmount),
    createdAt: row.createdAt,
    closedAt: row.closedAt,
  };
}

// ─── Pagar os dias em falta ─────────────────────────────────────────────────

/**
 * Paga a uma aplicação todos os dias que faltam até `today` (exclusive), ou
 * até ao vencimento nos fixos. Tem de correr dentro de uma transação que já
 * trancou a linha da aplicação.
 *
 * Devolve o `accrued` atualizado.
 */
async function catchUp(tx: Tx, inv: {
  id: string; planId: string; planType: InvestmentPlanType; principal: Prisma.Decimal;
  annualRate: Prisma.Decimal | null; startDate: Date; maturityDate: Date | null;
  accruedThrough: Date | null; accrued: Prisma.Decimal;
}, today: Day): Promise<number> {
  const until = accrualEnd(today, inv.maturityDate ? dateToDay(inv.maturityDate) : null);

  const fixedRate = num(inv.annualRate);
  const history = inv.planType === InvestmentPlanType.FLEXIBLE ? await rateHistory(tx, inv.planId) : [];

  const dias = pendingAccruals({
    principal: num(inv.principal),
    startDate: dateToDay(inv.startDate),
    accruedThrough: inv.accruedThrough ? dateToDay(inv.accruedThrough) : null,
    untilExclusive: until,
    rateForDay: (d) => (inv.planType === InvestmentPlanType.FIXED ? fixedRate : rateOn(history, d)),
  });

  if (dias.length === 0) return num(inv.accrued);

  // skipDuplicates: se outro processo já pagou algum destes dias (não deve,
  // estamos com a linha trancada), a restrição única ignora-o em vez de pagar
  // duas vezes. O total vem da SOMA das linhas, não de um incremento, para o
  // `accrued` nunca poder divergir do extrato diário.
  await tx.investmentAccrual.createMany({
    data: dias.map((d) => ({
      investmentId: inv.id,
      day: dayToDate(d.day),
      annualRate: d.annualRate,
      amount: d.amount,
    })),
    skipDuplicates: true,
  });

  const soma = await tx.investmentAccrual.aggregate({
    where: { investmentId: inv.id },
    _sum: { amount: true },
    _max: { day: true },
  });

  const accrued = num(soma._sum.amount);
  await tx.investment.update({
    where: { id: inv.id },
    data: { accrued, accruedThrough: soma._max.day },
  });
  return accrued;
}

/** Tranca a linha de uma aplicação e devolve-a fresca. */
async function lockInvestment(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM investments WHERE id = ${id} FOR UPDATE`;
  const inv = await tx.investment.findUnique({ where: { id } });
  if (!inv) throw new AppError('Aplicação não encontrada.', 404, 'INVESTMENT_NOT_FOUND');
  return inv;
}

/** Fecha uma aplicação já com os dias todos pagos. */
async function close(tx: Tx, inv: { id: string; userId: string; principal: Prisma.Decimal;
  planType: InvestmentPlanType; penaltyRate: Prisma.Decimal | null; maturityDate: Date | null;
}, accrued: number, today: Day): Promise<PayoutResult> {
  const r = computePayout({
    planType: inv.planType,
    principal: num(inv.principal),
    accrued,
    penaltyRatePct: inv.penaltyRate == null ? null : num(inv.penaltyRate),
    maturityDate: inv.maturityDate ? dateToDay(inv.maturityDate) : null,
    today,
  });

  await tx.investment.update({
    where: { id: inv.id },
    data: {
      status: InvestmentStatus.CLOSED,
      closeReason: r.reason,
      payout: r.payout,
      penaltyAmount: r.penalty,
      closedAt: new Date(),
    },
  });
  return r;
}

// ─── O serviço ──────────────────────────────────────────────────────────────

export class InvestmentsService {
  // ── Planos ────────────────────────────────────────────────────────────────

  async listPlans(actor: Actor, opts: { includeInactive?: boolean } = {}): Promise<PlanPublic[]> {
    const staff = podeVer(actor.role);
    const today = lisbonDay();
    // O nível de quem pergunta, para a tela poder mostrar os planos trancados
    // em vez de os esconder: um plano que não se vê não motiva ninguém a subir.
    const meuTier = staff ? null : await ranksService.currentTier(actor.id);

    const plans = await prisma.investmentPlan.findMany({
      where: staff && opts.includeInactive ? {} : { active: true },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      include: { rates: { select: { effectiveFrom: true, annualRate: true } } },
    });

    // Totais por plano só para a administração: ao motorista não interessa
    // quanto os outros aplicaram.
    const totals = staff
      ? await prisma.investment.groupBy({
          by: ['planId'],
          where: { status: InvestmentStatus.ACTIVE },
          _count: { _all: true },
          _sum: { principal: true },
        })
      : [];

    return plans.map((p) => {
      const hist = p.rates.map((r) => ({ effectiveFrom: dateToDay(r.effectiveFrom), annualRate: num(r.annualRate) }));
      const t = totals.find((x) => x.planId === p.id);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        type: p.type,
        annualRate: p.type === InvestmentPlanType.FLEXIBLE && hist.length ? rateOn(hist, today) : num(p.annualRate),
        termDays: p.termDays,
        earlyWithdrawalPenalty: p.earlyWithdrawalPenalty == null ? null : num(p.earlyWithdrawalPenalty),
        minAmount: num(p.minAmount),
        minRank: (p.minRank as Tier | null) ?? null,
        ...(meuTier
          ? { unlocked: !p.minRank || tierIndex(meuTier) >= tierIndex(p.minRank as Tier) }
          : {}),
        active: p.active,
        createdAt: p.createdAt,
        ...(staff ? { activeCount: t?._count._all ?? 0, activePrincipal: num(t?._sum.principal) } : {}),
      };
    });
  }

  async createPlan(actor: Actor, input: {
    name: string; description?: string | null; type: InvestmentPlanType; annualRate: number;
    termDays?: number | null; earlyWithdrawalPenalty?: number | null; minAmount?: number;
    minRank?: Tier | null; active?: boolean;
  }) {
    if (!isAdmin(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    const fixed = input.type === InvestmentPlanType.FIXED;

    if (fixed && !input.termDays) {
      throw new AppError('Um plano fixo precisa de um prazo em dias.', 400, 'TERM_REQUIRED');
    }

    const today = lisbonDay();
    const plan = await prisma.investmentPlan.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        type: input.type,
        annualRate: input.annualRate,
        // Os campos que só fazem sentido nos fixos ficam nulos nos flexíveis,
        // para não haver um "prazo" guardado que ninguém aplica.
        termDays: fixed ? input.termDays : null,
        earlyWithdrawalPenalty: fixed ? (input.earlyWithdrawalPenalty ?? 0) : null,
        minAmount: input.minAmount ?? 0,
        minRank: input.minRank ?? null,
        active: input.active ?? true,
        rates: { create: { annualRate: input.annualRate, effectiveFrom: dayToDate(today), createdBy: actor.id } },
      },
    });
    logger.info(`[investments] ${actor.id} criou o plano ${plan.id} (${plan.name}, ${plan.type}, ${input.annualRate}%)`);
    return plan;
  }

  /**
   * Alterar um plano.
   *
   * Nos FIXOS pode mudar-se tudo, porque a aplicação copia taxa, prazo e
   * penalização no momento em que é feita — mudar o plano só afeta quem
   * aplicar depois. Nos FLEXÍVEIS a taxa NÃO muda por aqui: muda por
   * `setRate`, que guarda a data. Mudar o tipo nunca: um plano com aplicações
   * de um tipo não pode passar a ser de outro.
   */
  async updatePlan(actor: Actor, id: string, input: {
    name?: string; description?: string | null; annualRate?: number; termDays?: number | null;
    earlyWithdrawalPenalty?: number | null; minAmount?: number; minRank?: Tier | null;
    active?: boolean;
  }) {
    if (!isAdmin(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    const plan = await prisma.investmentPlan.findUnique({ where: { id } });
    if (!plan) throw new AppError('Plano não encontrado.', 404, 'PLAN_NOT_FOUND');
    const fixed = plan.type === InvestmentPlanType.FIXED;

    if (!fixed && input.annualRate !== undefined) {
      throw new AppError(
        'Nos planos flexíveis a taxa muda em "Alterar taxa", para ficar registada a data.',
        400,
        'USE_SET_RATE',
      );
    }
    if (fixed && input.termDays === null) {
      throw new AppError('Um plano fixo precisa de um prazo em dias.', 400, 'TERM_REQUIRED');
    }

    const updated = await prisma.investmentPlan.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.minAmount !== undefined ? { minAmount: input.minAmount } : {}),
        ...(input.minRank !== undefined ? { minRank: input.minRank } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(fixed && input.annualRate !== undefined ? { annualRate: input.annualRate } : {}),
        ...(fixed && input.termDays !== undefined ? { termDays: input.termDays } : {}),
        ...(fixed && input.earlyWithdrawalPenalty !== undefined
          ? { earlyWithdrawalPenalty: input.earlyWithdrawalPenalty ?? 0 } : {}),
      },
    });

    // Nos fixos a taxa nova também fica no histórico, só para registo: quem
    // olhar para o plano daqui a um ano consegue ver quando mudou.
    if (fixed && input.annualRate !== undefined && input.annualRate !== num(plan.annualRate)) {
      await prisma.investmentPlanRate.upsert({
        where: { planId_effectiveFrom: { planId: id, effectiveFrom: dayToDate(lisbonDay()) } },
        create: { planId: id, annualRate: input.annualRate, effectiveFrom: dayToDate(lisbonDay()), createdBy: actor.id },
        update: { annualRate: input.annualRate, createdBy: actor.id },
      });
    }

    logger.info(`[investments] ${actor.id} alterou o plano ${id}`);
    return updated;
  }

  /**
   * Nova taxa de um plano flexível, a valer a partir de `effectiveFrom`.
   *
   * Só de HOJE em diante. O dia de hoje ainda não foi pago (paga-se depois de
   * acabar), portanto mudar a partir de hoje não reescreve nada que o
   * motorista já tenha visto. Uma data no passado mudaria ganhos já pagos, e é
   * recusada.
   */
  async setRate(actor: Actor, planId: string, input: { annualRate: number; effectiveFrom?: string }) {
    if (!isAdmin(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    const plan = await prisma.investmentPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new AppError('Plano não encontrado.', 404, 'PLAN_NOT_FOUND');
    if (plan.type !== InvestmentPlanType.FLEXIBLE) {
      throw new AppError(
        'Nos planos fixos a taxa altera-se editando o plano e só vale para aplicações novas.',
        400,
        'NOT_FLEXIBLE',
      );
    }

    const today = lisbonDay();
    const from = input.effectiveFrom ?? today;
    if (from < today) {
      throw new AppError('A nova taxa só pode valer a partir de hoje. Os dias passados já foram pagos.', 400, 'RATE_IN_PAST');
    }

    await prisma.$transaction(async (tx) => {
      await tx.investmentPlanRate.upsert({
        where: { planId_effectiveFrom: { planId, effectiveFrom: dayToDate(from) } },
        create: { planId, annualRate: input.annualRate, effectiveFrom: dayToDate(from), createdBy: actor.id },
        update: { annualRate: input.annualRate, createdBy: actor.id },
      });
      // A coluna do plano guarda a taxa de hoje. Uma taxa agendada para o
      // futuro não a muda; a leitura (`listPlans`) usa sempre o histórico.
      if (from === today) {
        await tx.investmentPlan.update({ where: { id: planId }, data: { annualRate: input.annualRate } });
      }
    });

    logger.info(`[investments] ${actor.id} mudou a taxa do plano ${planId} para ${input.annualRate}% a partir de ${from}`);
    return this.getRateHistory(actor, planId);
  }

  async getRateHistory(actor: Actor, planId: string) {
    if (!podeVer(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    const rows = await prisma.investmentPlanRate.findMany({
      where: { planId },
      orderBy: { effectiveFrom: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      annualRate: num(r.annualRate),
      effectiveFrom: dateToDay(r.effectiveFrom),
      createdAt: r.createdAt,
    }));
  }

  // ── Aplicar ───────────────────────────────────────────────────────────────

  async subscribe(actor: Actor, input: { planId: string; amount: number }): Promise<InvestmentPublic> {
    if (!podeAplicar(actor.role)) {
      throw new AppError('Só os motoristas podem aplicar em investimentos.', 403, 'FORBIDDEN');
    }
    const amount = round2(input.amount);
    if (!(amount > 0)) throw new AppError('O valor tem de ser maior que zero.', 400, 'INVALID_AMOUNT');

    const today = lisbonDay();

    // O nível é lido FORA da transação, de propósito: o `recompute` escreve
    // (métricas, eventos, notificações) e não tem nada que correr dentro de uma
    // transação que está a segurar a linha do utilizador. Um nível acabado de
    // subir já conta, porque a tela recalcula-o quando o motorista a abre.
    const meuTier = await ranksService.currentTier(actor.id);

    const id = await prisma.$transaction(async (tx) => {
      // Fila por utilizador: ver a nota de concorrência no topo.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`;

      const plan = await tx.investmentPlan.findUnique({ where: { id: input.planId } });
      if (!plan || !plan.active) {
        throw new AppError('Este plano não está disponível.', 400, 'PLAN_UNAVAILABLE');
      }
      if (amount < num(plan.minAmount)) {
        throw new AppError(`O valor mínimo deste plano é ${eur(num(plan.minAmount))}.`, 400, 'BELOW_MIN_AMOUNT');
      }
      if (plan.minRank && tierIndex(meuTier) < tierIndex(plan.minRank as Tier)) {
        const nivel = await tx.rankConfig.findUnique({
          where: { tier: plan.minRank }, select: { label: true },
        });
        throw new AppError(
          `Este plano é a partir do nível ${nivel?.label ?? plan.minRank}.`,
          400,
          'RANK_TOO_LOW',
        );
      }

      // O MESMO disponível que as retiradas verificam: lido da view, dentro
      // da transação, com a linha já trancada.
      const rows = await tx.$queryRaw<{ available: number }[]>`
        SELECT CAST(available AS FLOAT) AS available FROM driver_balances WHERE user_id = ${actor.id}
      `;
      const available = round2(Number(rows[0]?.available ?? 0));
      if (amount > available) {
        throw new AppError(
          `Saldo insuficiente. Disponível: ${eur(available)}.`,
          400,
          'INSUFFICIENT_BALANCE',
        );
      }

      const fixed = plan.type === InvestmentPlanType.FIXED;
      const created = await tx.investment.create({
        data: {
          userId: actor.id,
          planId: plan.id,
          principal: amount,
          planType: plan.type,
          // Congelados no momento da aplicação — ver o schema.
          annualRate: fixed ? plan.annualRate : null,
          termDays: fixed ? plan.termDays : null,
          penaltyRate: fixed ? plan.earlyWithdrawalPenalty : null,
          startDate: dayToDate(today),
          maturityDate: fixed && plan.termDays ? dayToDate(addDays(today, plan.termDays)) : null,
        },
      });

      await tx.notification.create({
        data: {
          userId: actor.id,
          title: 'Aplicação em investimento',
          message: `${eur(amount)} aplicados em "${plan.name}". Saíram do saldo principal e começam a render hoje.`,
        },
      });

      return created.id;
    });

    logger.info(`[investments] ${actor.id} aplicou ${eur(amount)} (aplicação ${id})`);
    return this.getOne(actor, id);
  }

  // ── Consultar ─────────────────────────────────────────────────────────────

  private async load(where: Prisma.InvestmentWhereInput) {
    return prisma.investment.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { plan: true, user: { select: { name: true } } },
    });
  }

  private async withHistories(rows: InvestmentRow[]): Promise<InvestmentPublic[]> {
    const today = lisbonDay();
    const planIds = [...new Set(rows.filter((r) => r.planType === InvestmentPlanType.FLEXIBLE).map((r) => r.planId))];
    const histories = new Map<string, RatePoint[]>();
    for (const pid of planIds) histories.set(pid, await rateHistory(prisma, pid));
    return rows.map((r) => toPublic(r, histories.get(r.planId) ?? [], today));
  }

  /** As aplicações de uma pessoa, com os totais. */
  async listForUser(actor: Actor, userId: string) {
    if (!podeVer(actor.role) && actor.id !== userId) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const items = await this.withHistories(await this.load({ userId }));
    const ativas = items.filter((i) => i.status === InvestmentStatus.ACTIVE);

    return {
      investments: items,
      totals: {
        invested: round2(ativas.reduce((s, i) => s + i.principal, 0)),
        gains: round2(ativas.reduce((s, i) => s + i.gains, 0)),
        currentValue: round2(ativas.reduce((s, i) => s + i.currentValue, 0)),
        dailyGain: round2(ativas.reduce((s, i) => s + i.dailyGain, 0)),
        // Ganhos já recebidos em aplicações fechadas (payout − principal).
        realizedGains: round2(items
          .filter((i) => i.status === InvestmentStatus.CLOSED)
          .reduce((s, i) => s + (num(i.payout) - i.principal), 0)),
      },
    };
  }

  async getOne(actor: Actor, id: string): Promise<InvestmentPublic> {
    const rows = await this.load({ id });
    if (!rows[0]) throw new AppError('Aplicação não encontrada.', 404, 'INVESTMENT_NOT_FOUND');
    if (!podeVer(actor.role) && rows[0].userId !== actor.id) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    return (await this.withHistories(rows))[0];
  }

  /** Detalhe com o registo: a aplicação, um ganho por dia, e o resgate. */
  async getDetail(actor: Actor, id: string) {
    const investment = await this.getOne(actor, id);
    const accruals = await prisma.investmentAccrual.findMany({
      where: { investmentId: id },
      orderBy: { day: 'desc' },
    });

    const events: InvestmentEvent[] = [];
    if (investment.closedAt) {
      events.push({
        kind: 'REDEMPTION',
        date: investment.closedAt.toISOString(),
        amount: num(investment.payout),
        detail: investment.closeReason === 'EARLY'
          ? `Resgate antecipado · penalização ${eur(num(investment.penaltyAmount))}`
          : investment.closeReason === 'MATURED' ? 'Fim do prazo' : 'Resgate',
      });
    }
    for (const a of accruals) {
      events.push({
        kind: 'GAIN',
        date: dateToDay(a.day),
        amount: Number(a.amount),
        annualRate: num(a.annualRate),
      });
    }
    events.push({ kind: 'DEPOSIT', date: investment.createdAt.toISOString(), amount: investment.principal });

    return { investment, events };
  }

  /** Vista da administração: todas as aplicações, com filtros e totais. */
  async adminOverview(actor: Actor, filter: { status?: string; planId?: string; search?: string } = {}) {
    if (!podeVer(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const where: Prisma.InvestmentWhereInput = {
      ...(filter.status === 'ACTIVE' || filter.status === 'CLOSED' ? { status: filter.status } : {}),
      ...(filter.planId ? { planId: filter.planId } : {}),
      ...(filter.search?.trim()
        ? { user: { name: { contains: filter.search.trim(), mode: 'insensitive' as const } } }
        : {}),
    };

    const items = await this.withHistories(await this.load(where));

    // Os totais olham para TODAS as ativas, não só para as filtradas: o
    // cabeçalho responde a "quanto devemos em investimentos", e esse número
    // não pode mudar consoante o filtro escolhido na lista.
    const ativas = await this.withHistories(await this.load({ status: InvestmentStatus.ACTIVE }));

    return {
      investments: items.slice(0, 500),
      truncated: items.length > 500,
      totals: {
        activeCount: ativas.length,
        invested: round2(ativas.reduce((s, i) => s + i.principal, 0)),
        gains: round2(ativas.reduce((s, i) => s + i.gains, 0)),
        dailyGain: round2(ativas.reduce((s, i) => s + i.dailyGain, 0)),
      },
    };
  }

  // ── Resgatar ──────────────────────────────────────────────────────────────

  /**
   * Quanto receberia se resgatasse agora. Não grava nada: calcula os dias em
   * falta em memória. O resgate a sério repete a conta dentro da transação.
   */
  async previewWithdraw(actor: Actor, id: string): Promise<PayoutResult & { today: Day }> {
    const inv = await prisma.investment.findUnique({ where: { id } });
    if (!inv) throw new AppError('Aplicação não encontrada.', 404, 'INVESTMENT_NOT_FOUND');
    if (inv.userId !== actor.id && !podeVer(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    if (inv.status !== InvestmentStatus.ACTIVE) {
      throw new AppError('Esta aplicação já foi resgatada.', 400, 'ALREADY_CLOSED');
    }

    const today = lisbonDay();
    const history = inv.planType === InvestmentPlanType.FLEXIBLE ? await rateHistory(prisma, inv.planId) : [];
    const falta = pendingAccruals({
      principal: num(inv.principal),
      startDate: dateToDay(inv.startDate),
      accruedThrough: inv.accruedThrough ? dateToDay(inv.accruedThrough) : null,
      untilExclusive: accrualEnd(today, inv.maturityDate ? dateToDay(inv.maturityDate) : null),
      rateForDay: (d) => (inv.planType === InvestmentPlanType.FIXED ? num(inv.annualRate) : rateOn(history, d)),
    });
    const accrued = num(inv.accrued) + falta.reduce((s, d) => s + d.amount, 0);

    return {
      ...computePayout({
        planType: inv.planType,
        principal: num(inv.principal),
        accrued,
        penaltyRatePct: inv.penaltyRate == null ? null : num(inv.penaltyRate),
        maturityDate: inv.maturityDate ? dateToDay(inv.maturityDate) : null,
        today,
      }),
      today,
    };
  }

  /**
   * Resgatar: paga os dias em falta, fecha a aplicação, e o `payout` volta ao
   * saldo principal (pela view — não há outro lançamento a fazer).
   *
   * O titular resgata a sua; o ADMIN pode resgatar qualquer uma (por exemplo,
   * antes de apagar uma conta). MANAGER e SUPPORT não.
   */
  async withdraw(actor: Actor, id: string): Promise<InvestmentPublic> {
    const today = lisbonDay();

    const result = await prisma.$transaction(async (tx) => {
      const inv = await lockInvestment(tx, id);
      if (inv.userId !== actor.id && !isAdmin(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
      if (inv.status !== InvestmentStatus.ACTIVE) {
        throw new AppError('Esta aplicação já foi resgatada.', 400, 'ALREADY_CLOSED');
      }

      const accrued = await catchUp(tx, inv, today);
      const r = await close(tx, inv, accrued, today);

      const plan = await tx.investmentPlan.findUnique({ where: { id: inv.planId }, select: { name: true } });
      await tx.notification.create({
        data: {
          userId: inv.userId,
          title: 'Investimento resgatado',
          message: r.reason === 'EARLY'
            ? `"${plan?.name}": ${eur(r.payout)} voltaram ao saldo principal (ganhos ${eur(r.gains)}, penalização por resgate antecipado ${eur(r.penalty)}).`
            : `"${plan?.name}": ${eur(r.payout)} voltaram ao saldo principal (ganhos ${eur(r.gains)}).`,
        },
      });
      return { userId: inv.userId, payout: r.payout };
    });

    logger.info(`[investments] ${actor.id} resgatou a aplicação ${id}: ${eur(result.payout)} para ${result.userId}`);
    return this.getOne(actor, id);
  }

  // ── O job diário ──────────────────────────────────────────────────────────

  /**
   * Paga os dias em falta a todas as aplicações ativas e fecha os fixos que
   * venceram. Corre todas as noites; se o servidor esteve parado, recupera os
   * dias que faltarem. Cada aplicação na sua própria transação: uma que falhe
   * não impede as outras de receber.
   */
  async runDailyAccrual(now: Date = new Date()): Promise<{ processed: number; matured: number; failed: number }> {
    const today = lisbonDay(now);
    const ativas = await prisma.investment.findMany({
      where: { status: InvestmentStatus.ACTIVE },
      select: { id: true },
    });

    let processed = 0;
    let matured = 0;
    let failed = 0;

    for (const { id } of ativas) {
      try {
        const venceu = await prisma.$transaction(async (tx) => {
          const inv = await lockInvestment(tx, id);
          if (inv.status !== InvestmentStatus.ACTIVE) return false; // resgatada entretanto

          const accrued = await catchUp(tx, inv, today);

          const maturity = inv.maturityDate ? dateToDay(inv.maturityDate) : null;
          if (inv.planType === InvestmentPlanType.FIXED && maturity && today >= maturity) {
            const r = await close(tx, inv, accrued, today);
            const plan = await tx.investmentPlan.findUnique({ where: { id: inv.planId }, select: { name: true } });
            await tx.notification.create({
              data: {
                userId: inv.userId,
                title: 'Investimento terminado',
                message: `"${plan?.name}" chegou ao fim do prazo (${fmtDay(maturity)}): ${eur(r.payout)} voltaram ao saldo principal, com ${eur(r.gains)} de ganhos.`,
              },
            });
            return true;
          }
          return false;
        });
        processed++;
        if (venceu) matured++;
      } catch (err) {
        failed++;
        logger.error(`[investments] Falhou o pagamento diário da aplicação ${id}`, err);
      }
    }

    logger.info(`[investments] Pagamento diário ${today}: ${processed} aplicações, ${matured} vencidas, ${failed} falhas.`);
    return { processed, matured, failed };
  }
}

export const investmentsService = new InvestmentsService();
