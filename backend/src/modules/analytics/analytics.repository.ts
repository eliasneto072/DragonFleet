import { prisma } from '../../config/prisma';
import { UserRole, UserStatus, WithdrawalStatus, EarningPlatform } from '../../shared/types/enums';

export const analyticsRepository = {
  async getStats() {
    const [
      totalDrivers,
      activeDrivers,
      totalEarningsRaw,
      pendingWithdrawals,
      earningsByPlatform,
      monthlyEarnings,
    ] = await Promise.all([
      // Total de motoristas cadastrados
      prisma.user.count({
        where: { role: UserRole.DRIVER },
      }),

      // Motoristas activos
      prisma.user.count({
        where: { role: UserRole.DRIVER, status: UserStatus.ACTIVE },
      }),

      // Soma total de ganhos
      prisma.earning.aggregate({
        _sum: { amount: true },
      }),

      // Retiradas pendentes
      prisma.withdrawal.count({
        where: { status: WithdrawalStatus.PENDING },
      }),

      // Ganhos agrupados por plataforma
      prisma.earning.groupBy({
        by: ['platform'],
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
      }),

      // Ganhos dos últimos 6 meses (agrupados por mês)
      prisma.$queryRaw<{ month: string; total: number }[]>`
        SELECT
          TO_CHAR(date, 'YYYY-MM') AS month,
          CAST(SUM(amount) AS FLOAT)  AS total
        FROM earnings
        WHERE date >= NOW() - INTERVAL '6 months'
        GROUP BY month
        ORDER BY month ASC
      `,
    ]);

    return {
      totalDrivers,
      activeDrivers,
      totalEarnings: Number(totalEarningsRaw._sum.amount ?? 0),
      pendingWithdrawals,
      earningsByPlatform: earningsByPlatform.map((e) => ({
        platform: e.platform as EarningPlatform,
        total: Number(e._sum.amount ?? 0),
      })),
      monthlyEarnings: monthlyEarnings.map((m) => ({
        month: m.month,
        total: Number(m.total),
      })),
    };
  },
};