// src/modules/reports/reports.repository.ts
//
// Data aggregation for reports. Pure data — no PDF concerns here.

import { prisma } from '../../config/prisma';
import {
  UserRole, UserStatus, WithdrawalStatus, EarningPlatform, AdjustmentType,
} from '../../shared/types/enums';

export interface FinancialReportData {
  range: { from: Date; to: Date };
  /**
   * Percentagem aplicada, em pontos (15 = 15%). Vem das configurações e viaja
   * com os dados: o rótulo do PDF imprime-a, em vez de a ter escrita no texto.
   */
  commissionPercent: number;
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

/** Uma linha do extrato: corrida registada ou ajuste lançado pela gestão. */
export interface StatementRow {
  date: Date;
  label: string;
  detail: string;
  amount: number; // negativo para descontos
}

export interface DriverEarningsReportData {
  driver: { name: string; email: string };
  range: { from: Date; to: Date };
  totals: {
    registered: number;  // soma dos ganhos lançados pelo motorista
    added: number;       // créditos lançados pela gestão
    deducted: number;    // débitos lançados pela gestão (positivo)
    net: number;         // registered + added − deducted
  };
  counts: { earnings: number; adjustments: number };
  byPlatform: { platform: EarningPlatform; total: number; count: number }[];
  rows: StatementRow[];
}

export const reportsRepository = {
  /**
   * @param commissionRate Fração (0.15 = 15%), vinda de SystemSettings.
   *
   * Havia aqui uma constante COMPANY_COMMISSION = 0.20, alinhada com o valor
   * cravado no frontend. A configuração do sistema diz 15, por isso o PDF
   * reportava a receita da empresa um terço acima do real — num documento que
   * sai da empresa.
   */
  async getFinancialReport(
    from: Date,
    to: Date,
    commissionRate: number,
  ): Promise<FinancialReportData> {
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
    const companyRevenue = Math.round(grossEarnings * commissionRate * 100) / 100;

    return {
      range: { from, to },
      commissionPercent: Math.round(commissionRate * 100 * 100) / 100,
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

  /**
   * Extrato de um motorista no período.
   *
   * Repare nas duas colunas de data diferentes: Earning é filtrado por `date`
   * (o dia da corrida) e BalanceAdjustment por `createdAt` (quando a gestão
   * lançou), porque o modelo de ajuste não guarda data de referência. É a
   * mesma regra aplicada no painel do motorista — mudar aqui sem mudar lá faz
   * o PDF divergir da tela.
   */
  async getDriverEarningsReport(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<DriverEarningsReportData | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) return null;

    const [earnings, adjustments, platformGroups] = await Promise.all([
      prisma.earning.findMany({
        where: { userId, date: { gte: from, lte: to } },
        orderBy: { date: 'desc' },
      }),
      prisma.balanceAdjustment.findMany({
        where: { userId, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.earning.groupBy({
        by: ['platform'],
        _sum: { amount: true },
        _count: { _all: true },
        where: { userId, date: { gte: from, lte: to } },
        orderBy: { _sum: { amount: 'desc' } },
      }),
    ]);

    const PLATFORM_LABEL: Record<string, string> = {
      UBER: 'Uber', BOLT: 'Bolt', FREE_NOW: 'Free Now', OTHER: 'Outro',
    };

    const earningRows: StatementRow[] = earnings.map((e) => ({
      date: e.date,
      label: PLATFORM_LABEL[e.platform] ?? e.platform,
      detail: 'Corrida registada',
      amount: Number(e.amount),
    }));

    // O extrato do motorista não usa as palavras "crédito" e "débito": um
    // crédito é, na prática, uma corrida que entrou por fora do registo.
    const adjustmentRows: StatementRow[] = adjustments.map((a) => ({
      date: a.createdAt,
      label: a.type === AdjustmentType.CREDIT ? 'Adicionado pela gestão' : 'Desconto',
      detail: a.reason?.trim() || '—',
      amount: a.type === AdjustmentType.CREDIT ? Number(a.amount) : -Number(a.amount),
    }));

    const registered = earnings.reduce((s, e) => s + Number(e.amount), 0);
    const added = adjustments
      .filter((a) => a.type === AdjustmentType.CREDIT)
      .reduce((s, a) => s + Number(a.amount), 0);
    const deducted = adjustments
      .filter((a) => a.type === AdjustmentType.DEBIT)
      .reduce((s, a) => s + Number(a.amount), 0);

    return {
      driver: { name: user.name, email: user.email },
      range: { from, to },
      totals: {
        registered,
        added,
        deducted,
        net: Math.round((registered + added - deducted) * 100) / 100,
      },
      counts: { earnings: earnings.length, adjustments: adjustments.length },
      byPlatform: platformGroups.map((p) => ({
        platform: p.platform as EarningPlatform,
        total: Number(p._sum.amount ?? 0),
        count: p._count._all,
      })),
      rows: [...earningRows, ...adjustmentRows].sort(
        (a, b) => b.date.getTime() - a.date.getTime(),
      ),
    };
  },
};