// src/modules/reports/reports.repository.ts
//
// Data aggregation for admin reports. Pure data — no PDF concerns here.

import { prisma } from '../../config/prisma';
import {
  UserRole, UserStatus, WithdrawalStatus, EarningPlatform,
} from '../../shared/types/enums';

export interface FinancialReportData {
  range: { from: Date; to: Date };
  totals: {
    grossEarnings: number;      // tudo que motoristas ganharam
    companyRevenue: number;     // comissão da empresa
    paidWithdrawals: number;    // já pago aos motoristas
    pendingWithdrawals: number; // aguardando aprovação
    outstandingBalance: number; // saldo ainda devido aos motoristas
  };
  counts: {
    totalDrivers: number;
    activeDrivers: number;
    earningsCount: number;
    withdrawalsCount: number;
  };
  byPlatform: { platform: EarningPlatform; total: number; count: number }[];
  topDrivers: { name: string; email: string; total: number }[];
  monthly: { month: string; total: number }[];
}

const COMPANY_COMMISSION = 0.20; // mantém o mesmo valor do frontend (FINANCIAL.companyCommission)

export const reportsRepository = {
  async getFinancialReport(from: Date, to: Date): Promise<FinancialReportData> {
    const dateFilter = { date: { gte: from, lte: to } };

    const [
      grossAgg,
      earningsCount,
      paidAgg,
      pendingAgg,
      withdrawalsCount,
      totalDrivers,
      activeDrivers,
      platformGroups,
      topDriversRaw,
      monthlyRaw,
    ] = await Promise.all([
      prisma.earning.aggregate({ _sum: { amount: true }, where: dateFilter }),
      prisma.earning.count({ where: dateFilter }),

      prisma.withdrawal.aggregate({
        _sum: { amount: true },
        where: { status: { in: [WithdrawalStatus.PAID, WithdrawalStatus.APPROVED] } },
      }),
      prisma.withdrawal.aggregate({
        _sum: { amount: true },
        where: { status: WithdrawalStatus.PENDING },
      }),
      prisma.withdrawal.count(),

      prisma.user.count({ where: { role: UserRole.DRIVER } }),
      prisma.user.count({ where: { role: UserRole.DRIVER, status: UserStatus.ACTIVE } }),

      prisma.earning.groupBy({
        by: ['platform'],
        _sum: { amount: true },
        _count: { _all: true },
        where: dateFilter,
        orderBy: { _sum: { amount: 'desc' } },
      }),

      prisma.$queryRaw<{ name: string; email: string; total: number }[]>`
        SELECT u.name, u.email, CAST(SUM(e.amount) AS FLOAT) AS total
        FROM earnings e
        JOIN users u ON u.id = e.user_id
        WHERE e.date >= ${from} AND e.date <= ${to}
        GROUP BY u.id, u.name, u.email
        ORDER BY total DESC
        LIMIT 10
      `,

      prisma.$queryRaw<{ month: string; total: number }[]>`
        SELECT TO_CHAR(date, 'YYYY-MM') AS month, CAST(SUM(amount) AS FLOAT) AS total
        FROM earnings
        WHERE date >= ${from} AND date <= ${to}
        GROUP BY month
        ORDER BY month ASC
      `,
    ]);

    const grossEarnings = Number(grossAgg._sum.amount ?? 0);
    const paidWithdrawals = Number(paidAgg._sum.amount ?? 0);
    const pendingWithdrawals = Number(pendingAgg._sum.amount ?? 0);
    const companyRevenue = grossEarnings * COMPANY_COMMISSION;

    return {
      range: { from, to },
      totals: {
        grossEarnings,
        companyRevenue,
        paidWithdrawals,
        pendingWithdrawals,
        outstandingBalance: Math.max(grossEarnings - paidWithdrawals, 0),
      },
      counts: {
        totalDrivers,
        activeDrivers,
        earningsCount,
        withdrawalsCount,
      },
      byPlatform: platformGroups.map((p) => ({
        platform: p.platform as EarningPlatform,
        total: Number(p._sum.amount ?? 0),
        count: p._count._all,
      })),
      topDrivers: topDriversRaw.map((d) => ({
        name: d.name,
        email: d.email,
        total: Number(d.total),
      })),
      monthly: monthlyRaw.map((m) => ({ month: m.month, total: Number(m.total) })),
    };
  },
};
