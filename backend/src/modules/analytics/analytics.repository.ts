import { prisma } from '../../config/prisma';
import { UserRole, UserStatus, WithdrawalStatus, EarningPlatform } from '../../shared/types/enums';

/**
 * Agregações do painel de análises.
 *
 * Tudo é somado em SQL. As telas de administração faziam GET /users,
 * /earnings, /withdrawals e /documents — as tabelas inteiras — e totalizavam
 * em JavaScript no browser. Com uma centena de motoristas isso são dezenas de
 * milhares de linhas pela rede para mostrar um único número, além de expor os
 * dados individuais de toda a gente onde bastava uma soma.
 */

export type Granularity = 'day' | 'month';

export interface AnalyticsStats {
  range: { from: Date; to: Date; granularity: Granularity };
  /** Estado do cadastro, não depende do período. */
  totalDrivers: number;
  activeDrivers: number;
  /** Métricas do período. */
  grossEarnings: number;
  earningsCount: number;
  /** Motoristas DISTINTOS que lançaram ganhos no período. */
  activeInPeriod: number;
  pendingWithdrawals: number;
  earningsByPlatform: { platform: EarningPlatform; total: number; count: number }[];
  series: { bucket: string; total: number }[];
  topDrivers: { name: string; email: string; total: number }[];
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
};
