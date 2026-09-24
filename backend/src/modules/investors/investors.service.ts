// src/modules/investors/investors.service.ts
//
// O portal do investidor: contas, depósitos, juro diário e resgates.
//
// As contas estão em `investors.math.ts` (puras, testadas à parte). Aqui só se
// vai buscar dados, se verifica quem pode fazer o quê, e se grava — sempre
// dentro de uma transação quando há dinheiro a mexer.
//
// ─── QUEM PODE O QUÊ ────────────────────────────────────────────────────────
//
//   ADMIN            cria contas, regista depósitos, muda taxas, decide
//                    resgates, vê tudo
//   MANAGER/SUPPORT  vê as contas e os extratos; não mexe
//   INVESTOR         vê a SUA conta, o SEU extrato, pede resgates
//   DRIVER           não tem nada que ver com isto — nem chega aqui
//
// ─── O DINHEIRO NÃO É O MESMO DOS MOTORISTAS ────────────────────────────────
//
// Um euro de um investidor e um euro de um motorista são dívidas diferentes da
// empresa, com origens diferentes e tratamento fiscal diferente. Por isso não
// há nenhuma ponte entre as duas views: nada aqui toca em `driver_balances`, e
// nenhum saldo de motorista é afetado por um depósito de investidor.
//
// O que os junta é uma única linha, no `overview()`: o total que a empresa
// deve. Essa soma interessa a quem gere a tesouraria e a mais ninguém.
//
// ─── CONCORRÊNCIA ───────────────────────────────────────────────────────────
//
// O pagamento diário e os resgates trancam a linha da CONTA
// (`SELECT … FOR UPDATE`) antes de ler saldos. Dois pedidos de resgate
// simultâneos ficam em fila, e o segundo já vê o primeiro como pendente — não
// se pede o mesmo euro duas vezes. A restrição única (conta, dia) sobre os
// movimentos ACCRUAL é a segunda rede contra pagar o mesmo dia a dobrar.

import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';
import { UserRole, UserStatus } from '../../shared/types/enums';
import {
  addDays, checkWithdrawal, dateToDay, dayToDate, lisbonDay,
  pendingInvestorAccruals, projectEarnings, round2, round6,
  withdrawalAvailableOn, type Day, type RatePoint,
} from './investors.math';

type Actor = { id: string; role?: UserRole };
type Tx = Prisma.TransactionClient;
type Bucket = 'CAPITAL' | 'EARNINGS';

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

const fmtDay = (d: Day) => d.split('-').reverse().join('/');

const num = (v: unknown): number => (v == null ? 0 : Number(v));

function isAdmin(role?: UserRole) {
  return role === UserRole.ADMIN;
}

/** Vê tudo, não mexe. Mesma separação do resto do projeto. */
function podeVer(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.SUPPORT;
}

function exigirAdmin(actor: Actor) {
  if (!isAdmin(actor.role)) {
    throw new AppError('Apenas a administração pode fazer isto.', 403, 'FORBIDDEN');
  }
}

// ─── O saldo, sempre lido da view ───────────────────────────────────────────

export interface InvestorBalance {
  accountId: string;
  userId: string;
  userName: string;
  userEmail: string;
  accountStatus: 'ACTIVE' | 'CLOSED';
  startDate: Day;
  accruedThrough: Day | null;
  noticeDays: number;
  capital: number;
  earnings: number;
  total: number;
  pendingCapital: number;
  pendingEarnings: number;
  availableCapital: number;
  availableEarnings: number;
  deposited: number;
  withdrawn: number;
  /// Capital aplicado em projetos abertos. Já descontado do disponível.
  investedInProjects: number;
  projectsCount: number;
}

type BalanceRow = {
  account_id: string; user_id: string; user_name: string; user_email: string;
  account_status: 'ACTIVE' | 'CLOSED'; start_date: Date; accrued_through: Date | null;
  notice_days: number; capital: number; earnings: number; total: number;
  pending_capital: number; pending_earnings: number;
  available_capital: number; available_earnings: number;
  deposited: number; withdrawn: number;
  invested_in_projects: number; projects_count: number;
};

function toBalance(r: BalanceRow): InvestorBalance {
  return {
    accountId: r.account_id,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    accountStatus: r.account_status,
    startDate: dateToDay(r.start_date),
    accruedThrough: r.accrued_through ? dateToDay(r.accrued_through) : null,
    noticeDays: r.notice_days,
    capital: round2(num(r.capital)),
    earnings: round2(num(r.earnings)),
    total: round2(num(r.total)),
    pendingCapital: round2(num(r.pending_capital)),
    pendingEarnings: round2(num(r.pending_earnings)),
    availableCapital: round2(num(r.available_capital)),
    availableEarnings: round2(num(r.available_earnings)),
    deposited: round2(num(r.deposited)),
    withdrawn: round2(num(r.withdrawn)),
    investedInProjects: round2(num(r.invested_in_projects)),
    projectsCount: Number(r.projects_count ?? 0),
  };
}

// As colunas vêm em NUMERIC, que o driver entrega como string. O CAST para
// FLOAT é feito no SQL para não haver dois sítios a converter de maneiras
// diferentes — e porque `Number('12.34')` num sítio e `Decimal` noutro é
// exatamente como nascem as diferenças de um cêntimo.
const BALANCE_COLS = Prisma.sql`
  account_id, user_id, user_name, user_email, account_status,
  start_date, accrued_through, notice_days,
  CAST(capital AS FLOAT)            AS capital,
  CAST(earnings AS FLOAT)           AS earnings,
  CAST(total AS FLOAT)              AS total,
  CAST(pending_capital AS FLOAT)    AS pending_capital,
  CAST(pending_earnings AS FLOAT)   AS pending_earnings,
  CAST(available_capital AS FLOAT)  AS available_capital,
  CAST(available_earnings AS FLOAT) AS available_earnings,
  CAST(deposited AS FLOAT)          AS deposited,
  CAST(withdrawn AS FLOAT)          AS withdrawn,
  CAST(invested_in_projects AS FLOAT) AS invested_in_projects,
  projects_count
`;

// ─── Serviço ────────────────────────────────────────────────────────────────

export class InvestorsService {
  // ══ Leitura de saldos ════════════════════════════════════════════════════

  private async balanceByAccount(accountId: string, tx: Tx | typeof prisma = prisma) {
    const rows = await tx.$queryRaw<BalanceRow[]>`
      SELECT ${BALANCE_COLS} FROM investor_balances WHERE account_id = ${accountId}`;
    if (!rows[0]) throw new AppError('Conta não encontrada.', 404, 'ACCOUNT_NOT_FOUND');
    return toBalance(rows[0]);
  }

  /** A conta do próprio, ou a de outro se quem pergunta tiver permissão. */
  private async resolveAccountId(actor: Actor, accountId?: string): Promise<string> {
    if (accountId) {
      if (!podeVer(actor.role)) {
        // Um investidor a pedir a conta de outro: a resposta é a mesma que
        // para uma conta inexistente. Dizer "não é sua" confirma que existe.
        const own = await prisma.investorAccount.findUnique({ where: { userId: actor.id } });
        if (!own || own.id !== accountId) {
          throw new AppError('Conta não encontrada.', 404, 'ACCOUNT_NOT_FOUND');
        }
        return own.id;
      }
      return accountId;
    }
    const own = await prisma.investorAccount.findUnique({ where: { userId: actor.id } });
    if (!own) throw new AppError('Não existe conta de investidor.', 404, 'NO_INVESTOR_ACCOUNT');
    return own.id;
  }

  // ══ Juro diário ══════════════════════════════════════════════════════════

  /**
   * Paga os dias em falta de uma conta, até ontem.
   *
   * Corre no job da madrugada E sempre que alguém abre a conta. Não é
   * redundância: se o job falhar numa noite, o investidor abre o portal e vê o
   * número certo à mesma. O que impede pagar duas vezes é a restrição única
   * (conta, dia) na base, não a ordem por que isto é chamado.
   *
   * Dias de capital zero avançam o `accruedThrough` sem escrever linha nenhuma
   * no extrato — um extrato cheio de "0,00 €" não ajuda ninguém a perceber a
   * conta dele.
   */
  async catchUp(accountId: string, now: Date = new Date()): Promise<number> {
    const today = lisbonDay(now);

    return prisma.$transaction(async (tx) => {
      // Tranca a conta: o job e um resgate à mesma hora não podem pagar o
      // mesmo dia duas vezes.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM investor_accounts WHERE id = ${accountId} FOR UPDATE`;
      if (!locked[0]) return 0;

      const account = await tx.investorAccount.findUniqueOrThrow({ where: { id: accountId } });
      if (account.status !== 'ACTIVE') return 0;

      const startDate = dateToDay(account.startDate);
      const accruedThrough = account.accruedThrough ? dateToDay(account.accruedThrough) : null;
      if (accruedThrough && accruedThrough >= addDays(today, -1)) return 0;

      const [rateRows, capitalRows] = await Promise.all([
        tx.investorRate.findMany({
          where: { accountId },
          orderBy: { effectiveFrom: 'asc' },
        }),
        tx.investorMovement.findMany({
          where: { accountId, bucket: 'CAPITAL' },
          select: { day: true, amount: true },
        }),
      ]);

      if (rateRows.length === 0) {
        // Sem taxa não se inventa nenhuma. A conta nasce sempre com uma linha;
        // se aqui não há, alguém a apagou à mão e é melhor dar por isso.
        logger.warn({ accountId }, 'Conta de investidor sem histórico de taxas — nada pago.');
        return 0;
      }

      const rates: RatePoint[] = rateRows.map((r) => ({
        effectiveFrom: dateToDay(r.effectiveFrom),
        annualRate: Number(r.annualRate),
      }));

      const dias = pendingInvestorAccruals({
        startDate,
        accruedThrough,
        untilExclusive: today, // rende até ontem, inclusive
        capitalMoves: capitalRows.map((m) => ({
          day: dateToDay(m.day),
          amount: Number(m.amount),
        })),
        rates,
      });

      if (dias.length === 0) return 0;

      const comValor = dias.filter((d) => d.amount > 0);
      if (comValor.length > 0) {
        await tx.investorMovement.createMany({
          data: comValor.map((d) => ({
            accountId,
            day: dayToDate(d.day),
            kind: 'ACCRUAL' as const,
            bucket: 'EARNINGS' as const,
            amount: new Prisma.Decimal(d.amount),
            description: `Juro de ${fmtDay(d.day)} · ${d.annualRate}% ao ano sobre ${eur(d.capital)}`,
          })),
        });
      }

      await tx.investorAccount.update({
        where: { id: accountId },
        data: { accruedThrough: dayToDate(dias[dias.length - 1].day) },
      });

      return comValor.length;
    });
  }

  /** O job da madrugada: percorre todas as contas ativas. */
  async runDaily(now: Date = new Date()): Promise<{ accounts: number; days: number }> {
    const contas = await prisma.investorAccount.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    let days = 0;
    for (const c of contas) {
      // Uma conta com um problema não pode impedir as outras de receber.
      try {
        days += await this.catchUp(c.id, now);
      } catch (err) {
        logger.error({ err, accountId: c.id }, 'Falha ao pagar juro de conta de investidor');
      }
    }
    return { accounts: contas.length, days };
  }

  // ══ O portal do investidor ═══════════════════════════════════════════════

  /** Tudo o que a primeira tela precisa, numa resposta só. */
  async me(actor: Actor) {
    const account = await prisma.investorAccount.findUnique({ where: { userId: actor.id } });
    if (!account) throw new AppError('Não existe conta de investidor.', 404, 'NO_INVESTOR_ACCOUNT');

    await this.catchUp(account.id);

    const today = lisbonDay();
    const [balance, rate, pendentes, ultimos] = await Promise.all([
      this.balanceByAccount(account.id),
      this.currentRate(account.id, today),
      prisma.investorWithdrawal.findMany({
        where: { accountId: account.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.investorMovement.findMany({
        where: { accountId: account.id },
        orderBy: [{ day: 'desc' }, { createdAt: 'desc' }],
        take: 8,
      }),
    ]);

    return {
      account: {
        id: account.id,
        status: account.status,
        startDate: dateToDay(account.startDate),
        noticeDays: account.noticeDays,
        annualRate: rate,
      },
      balance,
      projection: {
        day: round2(projectEarnings(balance.capital, rate, 1)),
        month: projectEarnings(balance.capital, rate, 30),
        year: projectEarnings(balance.capital, rate, 365),
      },
      pendingWithdrawals: pendentes.map(toWithdrawalPublic),
      recentMovements: ultimos.map(toMovementPublic),
    };
  }

  /** A taxa em vigor hoje. */
  private async currentRate(accountId: string, today: Day): Promise<number> {
    const r = await prisma.investorRate.findFirst({
      where: { accountId, effectiveFrom: { lte: dayToDate(today) } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (r) return Number(r.annualRate);
    // Só acontece numa conta cuja taxa começa no futuro. Mostrar a primeira é
    // mais útil do que mostrar zero.
    const primeira = await prisma.investorRate.findFirst({
      where: { accountId }, orderBy: { effectiveFrom: 'asc' },
    });
    return primeira ? Number(primeira.annualRate) : 0;
  }

  /** O extrato, paginado. */
  async statement(actor: Actor, opts: {
    accountId?: string;
    from?: Day;
    to?: Day;
    kind?: 'DEPOSIT' | 'ACCRUAL' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'PROFIT_SHARE' | 'PROJECT_RESULT';
    page?: number;
    pageSize?: number;
  }) {
    const accountId = await this.resolveAccountId(actor, opts.accountId);
    await this.catchUp(accountId);

    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));

    const where: Prisma.InvestorMovementWhereInput = { accountId };
    if (opts.from || opts.to) {
      where.day = {
        ...(opts.from ? { gte: dayToDate(opts.from) } : {}),
        ...(opts.to ? { lte: dayToDate(opts.to) } : {}),
      };
    }
    if (opts.kind) where.kind = opts.kind;

    const [total, rows] = await Promise.all([
      prisma.investorMovement.count({ where }),
      prisma.investorMovement.findMany({
        where,
        orderBy: [{ day: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { total, page, pageSize, movements: rows.map(toMovementPublic) };
  }

  /**
   * Os juros agrupados por mês — é assim que um investidor olha para isto.
   *
   * Feito em SQL e não em TypeScript porque uma conta com anos de história tem
   * milhares de linhas diárias, e trazê-las todas para o servidor só para as
   * somar é trabalho a mais para uma resposta que são doze números.
   */
  async monthlyEarnings(actor: Actor, accountId?: string) {
    const id = await this.resolveAccountId(actor, accountId);
    await this.catchUp(id);

    const rows = await prisma.$queryRaw<{ month: string; amount: number }[]>`
      SELECT to_char(day, 'YYYY-MM')       AS month,
             CAST(SUM(amount) AS FLOAT)    AS amount
      FROM investor_movements
      WHERE account_id = ${id} AND kind = 'ACCRUAL'
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 24`;

    return rows
      .map((r) => ({ month: r.month, amount: round2(num(r.amount)) }))
      .reverse();
  }

  // ══ Resgates ═════════════════════════════════════════════════════════════

  async requestWithdrawal(actor: Actor, input: {
    bucket: Bucket; amount: number; note?: string;
  }) {
    const account = await prisma.investorAccount.findUnique({ where: { userId: actor.id } });
    if (!account) throw new AppError('Não existe conta de investidor.', 404, 'NO_INVESTOR_ACCOUNT');
    if (account.status !== 'ACTIVE') {
      throw new AppError('Esta conta está fechada.', 409, 'ACCOUNT_CLOSED');
    }

    await this.catchUp(account.id);
    const today = lisbonDay();

    return prisma.$transaction(async (tx) => {
      // Tranca antes de ler o disponível: sem isto, dois pedidos do saldo todo
      // enviados ao mesmo tempo passam os dois.
      await tx.$queryRaw`SELECT id FROM investor_accounts WHERE id = ${account.id} FOR UPDATE`;

      const balance = await this.balanceByAccount(account.id, tx);
      const disponivel = input.bucket === 'CAPITAL'
        ? balance.availableCapital
        : balance.availableEarnings;

      const check = checkWithdrawal({ amount: input.amount, available: disponivel });
      if (!check.ok) {
        if (check.reason === 'NOT_POSITIVE') {
          throw new AppError('O valor tem de ser maior do que zero.', 400, 'INVALID_AMOUNT');
        }
        throw new AppError(
          `Só tem ${eur(disponivel)} disponíveis para resgate${
            (input.bucket === 'CAPITAL' ? balance.pendingCapital : balance.pendingEarnings) > 0
              ? ' (os pedidos por decidir já estão descontados)' : ''
          }.`,
          409, 'INSUFFICIENT_FUNDS',
        );
      }

      const availableOn = withdrawalAvailableOn({
        today, bucket: input.bucket, noticeDays: account.noticeDays,
      });

      const w = await tx.investorWithdrawal.create({
        data: {
          accountId: account.id,
          bucket: input.bucket,
          amount: new Prisma.Decimal(round2(input.amount)),
          availableOn: dayToDate(availableOn),
          note: input.note?.trim() || null,
        },
      });

      return toWithdrawalPublic(w);
    });
  }

  async myWithdrawals(actor: Actor, accountId?: string) {
    const id = await this.resolveAccountId(actor, accountId);
    const rows = await prisma.investorWithdrawal.findMany({
      where: { accountId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toWithdrawalPublic);
  }

  /** O investidor desiste de um pedido ainda por decidir. */
  async cancelWithdrawal(actor: Actor, id: string) {
    const w = await prisma.investorWithdrawal.findUnique({
      where: { id }, include: { account: true },
    });
    if (!w || w.account.userId !== actor.id) {
      throw new AppError('Pedido não encontrado.', 404, 'WITHDRAWAL_NOT_FOUND');
    }
    if (w.status !== 'PENDING') {
      throw new AppError('Este pedido já foi decidido.', 409, 'ALREADY_DECIDED');
    }

    // Apagar em vez de marcar: um pedido que o próprio retirou antes de
    // qualquer decisão não é informação que valha a pena guardar, e uma lista
    // de cancelados só torna mais difícil ver os que interessam.
    await prisma.investorWithdrawal.delete({ where: { id } });
    return { ok: true };
  }

  // ══ Administração ════════════════════════════════════════════════════════

  /** Todas as contas, com saldos. A tela de Investidores. */
  async listAccounts(actor: Actor) {
    if (!podeVer(actor.role)) throw new AppError('Acesso restrito.', 403, 'FORBIDDEN');

    const contas = await prisma.investorAccount.findMany({ select: { id: true } });
    // Pagar os dias em falta antes de mostrar totais: uma tela de gestão que
    // mostra um número desatualizado é pior do que uma que demora um segundo.
    for (const c of contas) {
      try { await this.catchUp(c.id); } catch { /* o erro já foi registado */ }
    }

    const rows = await prisma.$queryRaw<BalanceRow[]>`
      SELECT ${BALANCE_COLS} FROM investor_balances ORDER BY total DESC`;

    const hoje = lisbonDay();
    const taxas = await prisma.investorRate.findMany({
      where: { effectiveFrom: { lte: dayToDate(hoje) } },
      orderBy: { effectiveFrom: 'asc' },
    });
    const taxaPorConta = new Map<string, number>();
    for (const t of taxas) taxaPorConta.set(t.accountId, Number(t.annualRate));

    return rows.map((r) => ({
      ...toBalance(r),
      annualRate: taxaPorConta.get(r.account_id) ?? 0,
    }));
  }

  /** Os totais da tesouraria. */
  async overview(actor: Actor) {
    if (!podeVer(actor.role)) throw new AppError('Acesso restrito.', 403, 'FORBIDDEN');

    const [inv] = await prisma.$queryRaw<{
      accounts: number; capital: number; earnings: number; total: number; pending: number;
    }[]>`
      SELECT COUNT(*)::int                                       AS accounts,
             CAST(COALESCE(SUM(capital), 0) AS FLOAT)            AS capital,
             CAST(COALESCE(SUM(earnings), 0) AS FLOAT)           AS earnings,
             CAST(COALESCE(SUM(total), 0) AS FLOAT)              AS total,
             CAST(COALESCE(SUM(pending_capital + pending_earnings), 0) AS FLOAT) AS pending
      FROM investor_balances
      WHERE account_status = 'ACTIVE'`;

    // O que a empresa deve aos motoristas, para a comparação valer a pena.
    // Lido da view deles — não recalculado aqui.
    const [drv] = await prisma.$queryRaw<{ owed: number }[]>`
      SELECT CAST(COALESCE(SUM(available + invested_active), 0) AS FLOAT) AS owed
      FROM driver_balances`;

    const investors = {
      accounts: Number(inv?.accounts ?? 0),
      capital: round2(num(inv?.capital)),
      earnings: round2(num(inv?.earnings)),
      total: round2(num(inv?.total)),
      pending: round2(num(inv?.pending)),
    };

    return {
      investors,
      driversOwed: round2(num(drv?.owed)),
      totalLiability: round2(investors.total + num(drv?.owed)),
    };
  }

  async getAccount(actor: Actor, accountId: string) {
    if (!podeVer(actor.role)) throw new AppError('Acesso restrito.', 403, 'FORBIDDEN');
    await this.catchUp(accountId);

    const [account, balance] = await Promise.all([
      prisma.investorAccount.findUnique({
        where: { id: accountId },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, status: true } },
          rates: { orderBy: { effectiveFrom: 'desc' } },
        },
      }),
      this.balanceByAccount(accountId),
    ]);
    if (!account) throw new AppError('Conta não encontrada.', 404, 'ACCOUNT_NOT_FOUND');

    const [movements, withdrawals] = await Promise.all([
      prisma.investorMovement.findMany({
        where: { accountId },
        orderBy: [{ day: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      prisma.investorWithdrawal.findMany({
        where: { accountId }, orderBy: { createdAt: 'desc' }, take: 50,
      }),
    ]);

    return {
      account: {
        id: account.id,
        status: account.status,
        startDate: dateToDay(account.startDate),
        accruedThrough: account.accruedThrough ? dateToDay(account.accruedThrough) : null,
        noticeDays: account.noticeDays,
        notes: account.notes,
        user: account.user,
        rates: account.rates.map((r) => ({
          id: r.id,
          effectiveFrom: dateToDay(r.effectiveFrom),
          annualRate: Number(r.annualRate),
        })),
      },
      balance,
      movements: movements.map(toMovementPublic),
      withdrawals: withdrawals.map(toWithdrawalPublic),
    };
  }

  /**
   * Cria o utilizador e a conta, de uma vez.
   *
   * O investidor nunca se regista sozinho: não há registo público neste portal.
   * Quem entra foi posto cá dentro por alguém que já falou com ele — o que é
   * a forma mais simples de garantir que ninguém abre uma conta destas por
   * engano ou por curiosidade.
   */
  async createInvestor(actor: Actor, input: {
    name: string; email: string; password: string; phone?: string;
    annualRate: number; noticeDays?: number; startDate?: Day; notes?: string;
  }) {
    exigirAdmin(actor);

    const email = input.email.trim().toLowerCase();
    const existente = await prisma.user.findUnique({ where: { email } });
    if (existente) {
      throw new AppError('Já existe uma conta com este email.', 409, 'EMAIL_IN_USE');
    }

    const startDate = input.startDate ?? lisbonDay();
    const hash = await bcrypt.hash(input.password, 10);

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name.trim(),
          email,
          password: hash,
          phone: input.phone?.trim() || null,
          role: UserRole.INVESTOR,
          status: UserStatus.ACTIVE,
        },
      });

      const account = await tx.investorAccount.create({
        data: {
          userId: user.id,
          startDate: dayToDate(startDate),
          noticeDays: input.noticeDays ?? 0,
          notes: input.notes?.trim() || null,
        },
      });

      // A taxa inicial vale desde o primeiro dia da conta. Sem esta linha, o
      // cálculo diário não teria taxa nenhuma para usar e a conta não rendia.
      await tx.investorRate.create({
        data: {
          accountId: account.id,
          effectiveFrom: dayToDate(startDate),
          annualRate: new Prisma.Decimal(input.annualRate),
          createdBy: actor.id,
        },
      });

      return { userId: user.id, accountId: account.id };
    });
  }

  async updateAccount(actor: Actor, accountId: string, input: {
    noticeDays?: number; status?: 'ACTIVE' | 'CLOSED'; notes?: string;
  }) {
    exigirAdmin(actor);

    if (input.status === 'CLOSED') {
      const balance = await this.balanceByAccount(accountId);
      if (Math.round(balance.total * 100) !== 0) {
        throw new AppError(
          `Não é possível fechar uma conta com ${eur(balance.total)} por liquidar. Registe o resgate primeiro.`,
          409, 'ACCOUNT_NOT_EMPTY',
        );
      }
    }

    await prisma.investorAccount.update({
      where: { id: accountId },
      data: {
        ...(input.noticeDays !== undefined ? { noticeDays: input.noticeDays } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
      },
    });

    return this.getAccount(actor, accountId);
  }

  /** Regista dinheiro que entrou na conta da empresa. */
  async deposit(actor: Actor, accountId: string, input: {
    amount: number; day?: Day; description?: string;
  }) {
    exigirAdmin(actor);
    const amount = round2(input.amount);
    if (!(amount > 0)) {
      throw new AppError('O valor tem de ser maior do que zero.', 400, 'INVALID_AMOUNT');
    }

    const account = await prisma.investorAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new AppError('Conta não encontrada.', 404, 'ACCOUNT_NOT_FOUND');
    if (account.status !== 'ACTIVE') {
      throw new AppError('Esta conta está fechada.', 409, 'ACCOUNT_CLOSED');
    }

    const day = input.day ?? lisbonDay();

    // Um depósito com data anterior a dias já pagos muda o capital desses dias
    // — e portanto o juro deles. Recuar o `accruedThrough` faz o cálculo
    // repetir esses dias com o capital certo. As linhas antigas são apagadas
    // primeiro, senão a restrição única bloqueia o recálculo.
    const recalcularDesde = day <= (account.accruedThrough ? dateToDay(account.accruedThrough) : '')
      ? day
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM investor_accounts WHERE id = ${accountId} FOR UPDATE`;

      await tx.investorMovement.create({
        data: {
          accountId,
          day: dayToDate(day),
          kind: 'DEPOSIT',
          bucket: 'CAPITAL',
          amount: new Prisma.Decimal(amount),
          description: input.description?.trim() || 'Depósito',
          createdBy: actor.id,
        },
      });

      if (recalcularDesde) {
        await tx.investorMovement.deleteMany({
          where: { accountId, kind: 'ACCRUAL', day: { gte: dayToDate(recalcularDesde) } },
        });
        await tx.investorAccount.update({
          where: { id: accountId },
          data: {
            accruedThrough: recalcularDesde === dateToDay(account.startDate)
              ? null
              : dayToDate(addDays(recalcularDesde, -1)),
          },
        });
      }

      await tx.notification.create({
        data: {
          userId: account.userId,
          title: 'Depósito registado',
          message: `Foram creditados ${eur(amount)} na sua conta, com data de ${fmtDay(day)}.`,
        },
      });
    });

    if (recalcularDesde) await this.catchUp(accountId);

    return this.balanceByAccount(accountId);
  }

  /**
   * Correção manual, em qualquer dos bolsos.
   *
   * Existe porque erros acontecem — um depósito registado com o valor trocado,
   * um acerto combinado por escrito — e a alternativa a ter isto é alguém
   * mexer na base de dados à mão, sem registo e sem motivo escrito.
   * O motivo é obrigatório de propósito.
   */
  async adjust(actor: Actor, accountId: string, input: {
    bucket: Bucket; amount: number; description: string;
  }) {
    exigirAdmin(actor);

    const amount = round2(input.amount);
    if (amount === 0) {
      throw new AppError('O valor não pode ser zero.', 400, 'INVALID_AMOUNT');
    }
    if (!input.description?.trim()) {
      throw new AppError('Escreva o motivo do acerto.', 400, 'REASON_REQUIRED');
    }

    const account = await prisma.investorAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new AppError('Conta não encontrada.', 404, 'ACCOUNT_NOT_FOUND');

    const balance = await this.balanceByAccount(accountId);
    const atual = input.bucket === 'CAPITAL' ? balance.capital : balance.earnings;
    if (round2(atual + amount) < 0) {
      throw new AppError(
        `O acerto deixaria ${input.bucket === 'CAPITAL' ? 'o capital' : 'o rendimento'} negativo.`,
        409, 'WOULD_GO_NEGATIVE',
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.investorMovement.create({
        data: {
          accountId,
          day: dayToDate(lisbonDay()),
          kind: 'ADJUSTMENT',
          bucket: input.bucket,
          amount: new Prisma.Decimal(amount),
          description: input.description.trim(),
          createdBy: actor.id,
        },
      });
      await tx.notification.create({
        data: {
          userId: account.userId,
          title: 'Acerto na sua conta',
          message: `${amount > 0 ? 'Crédito' : 'Débito'} de ${eur(Math.abs(amount))}: ${input.description.trim()}`,
        },
      });
    });

    return this.balanceByAccount(accountId);
  }

  /** Nova taxa a partir de uma data. Não reescreve o passado. */
  async setRate(actor: Actor, accountId: string, input: {
    annualRate: number; effectiveFrom?: Day;
  }) {
    exigirAdmin(actor);

    const account = await prisma.investorAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new AppError('Conta não encontrada.', 404, 'ACCOUNT_NOT_FOUND');

    const effectiveFrom = input.effectiveFrom ?? lisbonDay();
    const jaPago = account.accruedThrough ? dateToDay(account.accruedThrough) : null;

    // Uma taxa com efeito em dias JÁ PAGOS obriga a refazer esses dias. Fazê-lo
    // em silêncio mudava o extrato do investidor sem ele saber porquê; por isso
    // é recusado, e quem quiser mesmo corrigir o passado usa um acerto, que
    // fica escrito no extrato com o motivo.
    if (jaPago && effectiveFrom <= jaPago) {
      throw new AppError(
        `Já há juros pagos até ${fmtDay(jaPago)}. A nova taxa só pode valer a partir de ${fmtDay(addDays(jaPago, 1))}.`,
        409, 'RATE_IN_THE_PAST',
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.investorRate.upsert({
        where: {
          accountId_effectiveFrom: { accountId, effectiveFrom: dayToDate(effectiveFrom) },
        },
        create: {
          accountId,
          effectiveFrom: dayToDate(effectiveFrom),
          annualRate: new Prisma.Decimal(input.annualRate),
          createdBy: actor.id,
        },
        update: { annualRate: new Prisma.Decimal(input.annualRate), createdBy: actor.id },
      });

      await tx.notification.create({
        data: {
          userId: account.userId,
          title: 'Taxa atualizada',
          message: `A partir de ${fmtDay(effectiveFrom)} a sua conta passa a render ${input.annualRate}% ao ano.`,
        },
      });
    });

    return this.getAccount(actor, accountId);
  }

  /** Todos os pedidos por decidir, de todas as contas. */
  async pendingWithdrawals(actor: Actor) {
    if (!podeVer(actor.role)) throw new AppError('Acesso restrito.', 403, 'FORBIDDEN');

    const rows = await prisma.investorWithdrawal.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { account: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });

    return rows.map((w) => ({
      ...toWithdrawalPublic(w),
      accountId: w.accountId,
      investor: w.account.user,
    }));
  }

  /**
   * Pagar ou recusar um pedido.
   *
   * Pagar cria o movimento negativo — é nesse momento que o dinheiro sai do
   * saldo. Até lá o pedido só o reserva.
   */
  async decideWithdrawal(actor: Actor, id: string, input: {
    approve: boolean; decision?: string;
  }) {
    exigirAdmin(actor);

    return prisma.$transaction(async (tx) => {
      const w = await tx.investorWithdrawal.findUnique({
        where: { id }, include: { account: true },
      });
      if (!w) throw new AppError('Pedido não encontrado.', 404, 'WITHDRAWAL_NOT_FOUND');
      if (w.status !== 'PENDING') {
        throw new AppError('Este pedido já foi decidido.', 409, 'ALREADY_DECIDED');
      }

      await tx.$queryRaw`SELECT id FROM investor_accounts WHERE id = ${w.accountId} FOR UPDATE`;

      const amount = Number(w.amount);

      if (input.approve) {
        await tx.investorMovement.create({
          data: {
            accountId: w.accountId,
            day: dayToDate(lisbonDay()),
            kind: 'WITHDRAWAL',
            bucket: w.bucket,
            amount: new Prisma.Decimal(-amount),
            description: w.bucket === 'CAPITAL' ? 'Resgate de capital' : 'Resgate de rendimento',
            withdrawalId: w.id,
            createdBy: actor.id,
          },
        });
      }

      const atualizado = await tx.investorWithdrawal.update({
        where: { id },
        data: {
          status: input.approve ? 'PAID' : 'REJECTED',
          decision: input.decision?.trim() || null,
          decidedAt: new Date(),
          decidedBy: actor.id,
        },
      });

      await tx.notification.create({
        data: {
          userId: w.account.userId,
          title: input.approve ? 'Resgate pago' : 'Resgate recusado',
          message: input.approve
            ? `O resgate de ${eur(amount)} foi processado.`
            : `O pedido de resgate de ${eur(amount)} não foi aprovado.${
                input.decision?.trim() ? ` Motivo: ${input.decision.trim()}` : ''
              }`,
        },
      });

      return toWithdrawalPublic(atualizado);
    });
  }
}

// ─── Formas públicas ────────────────────────────────────────────────────────

function toMovementPublic(m: {
  id: string; day: Date; kind: string; bucket: string;
  amount: Prisma.Decimal | number; description: string | null; createdAt: Date;
}) {
  return {
    id: m.id,
    day: dateToDay(m.day),
    kind: m.kind as
      'DEPOSIT' | 'ACCRUAL' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'PROFIT_SHARE' | 'PROJECT_RESULT',
    bucket: m.bucket as Bucket,
    // Seis casas no extrato seriam ruído: o juro de um dia mostra-se ao
    // cêntimo. O valor exato continua guardado, e é a soma dele — não a soma
    // dos arredondamentos — que dá o saldo.
    amount: round6(Number(m.amount)),
    description: m.description,
    createdAt: m.createdAt.toISOString(),
  };
}

function toWithdrawalPublic(w: {
  id: string; bucket: string; amount: Prisma.Decimal | number; status: string;
  availableOn: Date; note: string | null; decision: string | null;
  createdAt: Date; decidedAt: Date | null;
}) {
  return {
    id: w.id,
    bucket: w.bucket as Bucket,
    amount: round2(Number(w.amount)),
    status: w.status as 'PENDING' | 'PAID' | 'REJECTED',
    availableOn: dateToDay(w.availableOn),
    note: w.note,
    decision: w.decision,
    createdAt: w.createdAt.toISOString(),
    decidedAt: w.decidedAt ? w.decidedAt.toISOString() : null,
  };
}

export const investorsService = new InvestorsService();
