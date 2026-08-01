import { prisma } from '../../config/prisma';
import {
  UserRole, UserStatus, WithdrawalStatus, DocumentStatus, EarningPlatform,
  EarningStatus, SettlementStatus,
} from '../../shared/types/enums';

/**
 * Agregações do módulo de análises.
 *
 * Tudo é somado em SQL. As telas de administração faziam GET /users,
 * /earnings, /withdrawals e /documents — as tabelas inteiras — e totalizavam
 * em JavaScript no browser. Com uma centena de motoristas isso são dezenas de
 * milhares de linhas pela rede para mostrar um único número, além de expor os
 * dados individuais de toda a gente onde bastava uma soma.
 *
 * getStats  → tendência ao longo do tempo (tela de Análises)
 * getOverview → o que precisa de ação agora (painel)
 */

export type Granularity = 'day' | 'month';

export interface AnalyticsStats {
  range: { from: Date; to: Date; granularity: Granularity };
  totalDrivers: number;
  activeDrivers: number;
  grossEarnings: number;
  earningsCount: number;
  activeInPeriod: number;
  pendingWithdrawals: number;
  earningsByPlatform: { platform: EarningPlatform; total: number; count: number }[];
  series: { bucket: string; total: number }[];
  topDrivers: { name: string; email: string; total: number }[];
}

export interface StalledDriver {
  id: string;
  name: string;
  email: string;
  lastEarningAt: Date;
  totalEarned: number;
}

/** Motorista ativo sem fecho da semana de referência. */
export interface DriverWithoutSettlement {
  id: string;
  name: string;
}

export interface OverviewRaw {
  documentsPending: { count: number; oldestAt: Date | null };
  withdrawalsPending: { count: number; total: number; oldestAt: Date | null };
  earningsPending: { count: number; oldestAt: Date | null };
  driversBlocked: number;
  documentsExpiringSoon: number;
  /** Quem ainda não tem a semana passada fechada. */
  missingSettlements: DriverWithoutSettlement[];
  grossThisMonth: number;
  grossPrevMonth: number;
  paidThisMonth: number;
  paidCountThisMonth: number;
  owedToDrivers: number;
  owedByDrivers: number;
  totalDrivers: number;
  activeLast30: number;
  stalledDrivers: StalledDriver[];
}

/**
 * Intervalos curtos ganham barras diárias; longos, mensais. A decisão fica
 * aqui e não no frontend porque é ela que define o GROUP BY.
 */
function pickGranularity(from: Date, to: Date): Granularity {
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  return days <= 62 ? 'day' : 'month';
}

export const analyticsRepository = {
  async getStats(from: Date, to: Date): Promise<AnalyticsStats> {
    const granularity = pickGranularity(from, to);
    const bucketFormat = granularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
    const inRange = { date: { gte: from, lte: to } };

    const [
      totalDrivers,
      activeDrivers,
      grossRaw,
      earningsCount,
      pendingWithdrawals,
      byPlatform,
      seriesRaw,
      activeRaw,
      topDriversRaw,
    ] = await Promise.all([
      prisma.user.count({ where: { role: UserRole.DRIVER } }),

      prisma.user.count({
        where: { role: UserRole.DRIVER, status: UserStatus.ACTIVE },
      }),

      prisma.earning.aggregate({ _sum: { amount: true }, where: inRange }),

      prisma.earning.count({ where: inRange }),

      prisma.withdrawal.count({ where: { status: WithdrawalStatus.PENDING } }),

      // Soma EUROS por plataforma. O frontend fazia map[platform] += 1, ou
      // seja, contava lançamentos: uma plataforma com muitos registos pequenos
      // aparecia maior que outra com poucos e grandes.
      prisma.earning.groupBy({
        by: ['platform'],
        _sum: { amount: true },
        _count: { _all: true },
        where: inRange,
        orderBy: { _sum: { amount: 'desc' } },
      }),

      // TO_CHAR aceita o formato como parâmetro, por isso a interpolação
      // continua parametrizada e não vira concatenação de SQL.
      prisma.$queryRaw<{ bucket: string; total: number }[]>`
        SELECT
          TO_CHAR(date, ${bucketFormat}) AS bucket,
          CAST(SUM(amount) AS FLOAT)     AS total
        FROM earnings
        WHERE date >= ${from} AND date <= ${to}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,

      // Retenção real: quem de facto faturou. Diferente de status = ACTIVE,
      // que é estado de cadastro — alguém pode estar ativo e parado há meses.
      prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(DISTINCT user_id)::int AS count
        FROM earnings
        WHERE date >= ${from} AND date <= ${to}
      `,

      prisma.$queryRaw<{ name: string; email: string; total: number }[]>`
        SELECT u.name, u.email, CAST(SUM(e.amount) AS FLOAT) AS total
        FROM earnings e
        JOIN users u ON u.id = e.user_id
        WHERE e.date >= ${from} AND e.date <= ${to}
        GROUP BY u.id, u.name, u.email
        ORDER BY total DESC
        LIMIT 10
      `,
    ]);

    return {
      range: { from, to, granularity },
      totalDrivers,
      activeDrivers,
      grossEarnings: Number(grossRaw._sum.amount ?? 0),
      earningsCount,
      activeInPeriod: Number(activeRaw[0]?.count ?? 0),
      pendingWithdrawals,
      earningsByPlatform: byPlatform.map((e) => ({
        platform: e.platform as EarningPlatform,
        total: Number(e._sum.amount ?? 0),
        count: e._count._all,
      })),
      series: seriesRaw.map((s) => ({ bucket: s.bucket, total: Number(s.total) })),
      topDrivers: topDriversRaw.map((d) => ({
        name: d.name,
        email: d.email,
        total: Number(d.total),
      })),
    };
  },

  /**
   * Dados do painel: fila de trabalho, posição financeira e motoristas parados.
   *
   * @param stalledSince  Corte para considerar um motorista parado.
   * @param expiringUntil Limite superior do aviso de expiração de documento.
   */
  async getOverview(
    stalledSince: Date,
    expiringUntil: Date,
    lastWeek: { start: Date; end: Date },
  ): Promise<OverviewRaw> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);

    const [
      docsPendingCount,
      docsPendingOldest,
      withdrawalsPendingAgg,
      withdrawalsPendingOldest,
      earningsPendingCount,
      earningsPendingOldest,
      driversBlocked,
      documentsExpiringSoon,
      activeDriverRows,
      settledUserRows,
      grossThisMonthAgg,
      grossPrevMonthAgg,
      paidThisMonthAgg,
      totalDrivers,
      activeLast30Raw,
      balancesRaw,
      stalledRaw,
    ] = await Promise.all([
      prisma.document.count({ where: { status: DocumentStatus.PENDING } }),

      prisma.document.findFirst({
        where: { status: DocumentStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),

      prisma.withdrawal.aggregate({
        where: { status: WithdrawalStatus.PENDING },
        _sum: { amount: true },
        _count: { _all: true },
      }),

      prisma.withdrawal.findFirst({
        where: { status: WithdrawalStatus.PENDING },
        orderBy: { requestedAt: 'asc' },
        select: { requestedAt: true },
      }),

      // Lançamentos comunicados à espera de confirmação. Não movimentam saldo,
      // mas cada um é um motorista à espera de resposta.
      prisma.earning.count({ where: { status: EarningStatus.PENDING } }),

      prisma.earning.findFirst({
        where: { status: EarningStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),

      prisma.user.count({
        where: { role: UserRole.DRIVER, status: UserStatus.AGUARDANDO_REGULARIZACAO },
      }),

      // Aviso preventivo: o job já notifica o motorista, mas a gestão não via
      // nada. Ver antes evita que a pessoa pare de trabalhar.
      prisma.document.count({
        where: {
          status: DocumentStatus.APPROVED,
          expiresAt: { gte: now, lte: expiringUntil },
        },
      }),

      // Quem devia ter fecho da semana passada. As duas consultas são
      // separadas e cruzadas em memória: um NOT EXISTS com sobreposição de
      // intervalos em SQL fica difícil de ler e de conferir, e são poucas
      // dezenas de linhas de cada lado.
      prisma.user.findMany({
        where: { role: UserRole.DRIVER, status: UserStatus.ACTIVE },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),

      // Rascunho conta como feito: quem preparou e ainda não registou não
      // precisa de ver o aviso a meio do trabalho.
      prisma.weeklySettlement.findMany({
        where: {
          status: { not: SettlementStatus.CANCELLED },
          weekStart: { lte: lastWeek.end },
          weekEnd: { gte: lastWeek.start },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),

      prisma.earning.aggregate({
        where: { date: { gte: startOfMonth } },
        _sum: { amount: true },
      }),

      prisma.earning.aggregate({
        where: { date: { gte: startOfPrevMonth, lt: startOfMonth } },
        _sum: { amount: true },
      }),

      prisma.withdrawal.aggregate({
        where: { status: WithdrawalStatus.PAID, processedAt: { gte: startOfMonth } },
        _sum: { amount: true },
        _count: { _all: true },
      }),

      prisma.user.count({ where: { role: UserRole.DRIVER } }),

      prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(DISTINCT user_id)::int AS count
        FROM earnings
        WHERE date >= ${last30}
      `,

      // Passivo real: soma apenas os saldos POSITIVOS. Um motorista com saldo
      // negativo não abate o que a empresa deve aos outros — isso é valor a
      // receber, não menos dívida.
      //
      // A origem do dinheiro são os FECHOS SEMANAIS registados. Esta consulta
      // somava a tabela de ganhos, do tempo em que o motorista lançava o
      // próprio saldo; os lançamentos passaram a ser conferência e não creditam
      // nada, por isso somá-los aqui inflava o passivo e ignorava o que foi
      // efetivamente fechado.
      //
      // A fórmula por motorista é a mesma de balance.service.getSummary;
      // alterar lá sem alterar aqui faz o painel divergir das contas
      // individuais.
      prisma.$queryRaw<{ owed_to: number; owed_by: number }[]>`
        WITH balances AS (
          SELECT
            COALESCE(s.total, 0) + COALESCE(c.total, 0) - COALESCE(d.total, 0)
              - COALESCE(w.total, 0) - COALESCE(p.total, 0) AS available
          FROM users u
          LEFT JOIN (
            SELECT user_id, SUM(net_to_driver) AS total FROM weekly_settlements
            WHERE status = 'REGISTERED' GROUP BY user_id
          ) s ON s.user_id = u.id
          LEFT JOIN (
            SELECT user_id, SUM(amount) AS total FROM balance_adjustments
            WHERE type = 'CREDIT' GROUP BY user_id
          ) c ON c.user_id = u.id
          LEFT JOIN (
            SELECT user_id, SUM(amount) AS total FROM balance_adjustments
            WHERE type = 'DEBIT' GROUP BY user_id
          ) d ON d.user_id = u.id
          LEFT JOIN (
            SELECT user_id, SUM(amount) AS total FROM withdrawals
            WHERE status IN ('APPROVED', 'PAID') GROUP BY user_id
          ) w ON w.user_id = u.id
          LEFT JOIN (
            SELECT user_id, SUM(amount) AS total FROM withdrawals
            WHERE status = 'PENDING' GROUP BY user_id
          ) p ON p.user_id = u.id
          WHERE u.role = 'DRIVER'
        )
        SELECT
          CAST(COALESCE(SUM(CASE WHEN available > 0 THEN available ELSE 0 END), 0) AS FLOAT) AS owed_to,
          CAST(COALESCE(SUM(CASE WHEN available < 0 THEN -available ELSE 0 END), 0) AS FLOAT) AS owed_by
        FROM balances
      `,

      // JOIN e não LEFT JOIN: só entram motoristas que JÁ faturaram alguma vez.
      // Quem nunca lançou nada não "parou", ainda não começou — é outro
      // problema, com outra conversa.
      prisma.$queryRaw<{
        id: string; name: string; email: string; last_earning: Date; total_earned: number;
      }[]>`
        SELECT
          u.id, u.name, u.email,
          MAX(e.date)                AS last_earning,
          CAST(SUM(e.amount) AS FLOAT) AS total_earned
        FROM users u
        JOIN earnings e ON e.user_id = u.id
        WHERE u.role = 'DRIVER' AND u.status = 'ACTIVE'
        GROUP BY u.id, u.name, u.email
        HAVING MAX(e.date) < ${stalledSince}
        ORDER BY total_earned DESC
        LIMIT 8
      `,
    ]);

    const balances = balancesRaw[0] ?? { owed_to: 0, owed_by: 0 };

    const settledIds = new Set(settledUserRows.map((r) => r.userId));
    const missingSettlements = activeDriverRows.filter((d) => !settledIds.has(d.id));

    return {
      documentsPending: {
        count: docsPendingCount,
        oldestAt: docsPendingOldest?.createdAt ?? null,
      },
      earningsPending: {
        count: earningsPendingCount,
        oldestAt: earningsPendingOldest?.createdAt ?? null,
      },
      missingSettlements,
      withdrawalsPending: {
        count: withdrawalsPendingAgg._count._all,
        total: Number(withdrawalsPendingAgg._sum.amount ?? 0),
        oldestAt: withdrawalsPendingOldest?.requestedAt ?? null,
      },
      driversBlocked,
      documentsExpiringSoon,
      grossThisMonth: Number(grossThisMonthAgg._sum.amount ?? 0),
      grossPrevMonth: Number(grossPrevMonthAgg._sum.amount ?? 0),
      paidThisMonth: Number(paidThisMonthAgg._sum.amount ?? 0),
      paidCountThisMonth: paidThisMonthAgg._count._all,
      owedToDrivers: Number(balances.owed_to),
      owedByDrivers: Number(balances.owed_by),
      totalDrivers,
      activeLast30: Number(activeLast30Raw[0]?.count ?? 0),
      stalledDrivers: stalledRaw.map((d) => ({
        id: d.id,
        name: d.name,
        email: d.email,
        lastEarningAt: d.last_earning,
        totalEarned: Number(d.total_earned),
      })),
    };
  },
};