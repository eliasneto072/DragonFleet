"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRepository = void 0;
const prisma_1 = require("../../config/prisma");
const enums_1 = require("../../shared/types/enums");
exports.analyticsRepository = {
    async getStats() {
        const [totalDrivers, activeDrivers, totalEarningsRaw, pendingWithdrawals, earningsByPlatform, monthlyEarnings,] = await Promise.all([
            // Total de motoristas cadastrados
            prisma_1.prisma.user.count({
                where: { role: enums_1.UserRole.DRIVER },
            }),
            // Motoristas activos
            prisma_1.prisma.user.count({
                where: { role: enums_1.UserRole.DRIVER, status: enums_1.UserStatus.ACTIVE },
            }),
            // Soma total de ganhos
            prisma_1.prisma.earning.aggregate({
                _sum: { amount: true },
            }),
            // Retiradas pendentes
            prisma_1.prisma.withdrawal.count({
                where: { status: enums_1.WithdrawalStatus.PENDING },
            }),
            // Ganhos agrupados por plataforma
            prisma_1.prisma.earning.groupBy({
                by: ['platform'],
                _sum: { amount: true },
                orderBy: { _sum: { amount: 'desc' } },
            }),
            // Ganhos dos últimos 6 meses (agrupados por mês)
            prisma_1.prisma.$queryRaw `
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
                platform: e.platform,
                total: Number(e._sum.amount ?? 0),
            })),
            monthlyEarnings: monthlyEarnings.map((m) => ({
                month: m.month,
                total: Number(m.total),
            })),
        };
    },
};