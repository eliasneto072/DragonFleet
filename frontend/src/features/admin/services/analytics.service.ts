// src/features/admin/services/analytics.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { EarningPlatform } from '@/shared/types/api';

/** 'week': cada ponto é uma semana fechada, identificada pela segunda-feira. */
export type Granularity = 'week' | 'month';

export interface ApiStats {
  range: { from: string; to: string; granularity: Granularity };
  /** Estado do cadastro — não depende do período consultado. */
  totalDrivers: number;
  activeDrivers: number;
  /**
   * ─── MÉTRICAS DO PERÍODO, VINDAS DOS FECHOS REGISTADOS ─────────────────────
   *
   * Todas estas somam colunas gravadas e congeladas no fecho. Não são
   * recalculadas em lado nenhum, e por isso não podem divergir do recibo que o
   * motorista tem na mão.
   *
   * Antes vinham dos lançamentos comunicados, sem filtrar o estado: um valor
   * REJEITADO continuava a contar. E a receita da empresa era calculada aqui no
   * browser como bruto × comissão atual, o que ignorava as percentagens
   * congeladas de cada fecho e a incidência sobre o lucro em vez do bruto.
   *
   * Refletem SEMANAS FECHADAS: uma semana por registar não aparece.
   */
  /** Faturação bruta: Uber + Bolt + outras receitas. */
  grossEarnings: number;
  /** Comissão da empresa, como ficou gravada em cada fecho. */
  companyRevenue: number;
  /** O que os motoristas receberam, líquido de despesas e comissão. */
  netToDrivers: number;
  settlementsCount: number;
  /**
   * Motoristas distintos com semana fechada no período. Diferente de
   * activeDrivers, que conta status = ACTIVE: alguém pode estar ativo no
   * cadastro e não trabalhar há meses.
   */
  activeInPeriod: number;
  pendingWithdrawals: number;
  earningsByPlatform: { platform: EarningPlatform; total: number; count: number }[];
  /** Bucket é "YYYY-MM-DD" (segunda-feira da semana) ou "YYYY-MM". */
  series: { bucket: string; total: number }[];
  topDrivers: { name: string; email: string; total: number }[];
  /**
   * Comissão vigente em fração (0.15 = 15%), vinda de SystemSettings.
   *
   * NÃO usar FINANCIAL.companyCommission para este cálculo: aquela constante
   * está em 0.20 enquanto a configuração do sistema está em 15, e a receita
   * da empresa aparecia um terço acima do real.
   */
  companyCommission: number;
}

export interface StalledDriver {
  id: string;
  name: string;
  email: string;
  lastEarningAt: string;
  totalEarned: number;
}

export interface ApiOverview {
  queue: {
    documentsPending: { count: number; oldestAt: string | null };
    withdrawalsPending: { count: number; total: number; oldestAt: string | null };
    /** Lançamentos comunicados à espera de confirmação. Não movimentam saldo. */
    earningsPending: { count: number; oldestAt: string | null };
    /** Tickets de suporte abertos ou em progresso. */
    supportOpen: { count: number; oldestAt: string | null };
    /**
     * Dados bancários por aprovar.
     *
     * Opcional no tipo para o painel não rebentar contra um backend mais
     * antigo — durante um deploy os dois lados não sobem ao mesmo tempo.
     */
    bankPending?: { count: number; oldestAt: string | null };
    driversBlocked: number;
    documentsExpiringSoon: { count: number; days: number };
    /** Motoristas ativos sem fecho da semana passada. */
    missingSettlements: {
      count: number;
      drivers: { id: string; name: string }[];
      weekStart: string;
      weekEnd: string;
    };
  };
  finance: {
    companyCommission: number;
    revenueThisMonth: number;
    revenuePrevMonth: number;
    grossThisMonth: number;
    /** Passivo: soma apenas dos saldos positivos. */
    owedToDrivers: number;
    /** A receber: soma dos saldos negativos, em valor absoluto. */
    owedByDrivers: number;
    /** Quem está abaixo de zero, com o saldo de cada um. */
    negativeDrivers: { id: string; name: string; balance: number }[];
    paidThisMonth: number;
    paidCountThisMonth: number;
  };
  drivers: {
    total: number;
    activeLast30: number;
    stalledAfterDays: number;
    stalled: StalledDriver[];
  };
}

export interface StatsParams {
  /** "YYYY-MM-DD" */
  from?: string;
  /** "YYYY-MM-DD" */
  to?: string;
}

export const analyticsService = {
  /** GET /analytics/stats — apenas admin/manager. Sem datas, últimos 30 dias. */
  getStats(params: StatsParams = {}): Promise<{ stats: ApiStats }> {
    const query = new URLSearchParams();
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    const qs = query.toString();
    return apiClient.get(`/analytics/stats${qs ? `?${qs}` : ''}`);
  },

  /** GET /analytics/overview — fila de trabalho e posição financeira. */
  getOverview(): Promise<{ overview: ApiOverview }> {
    return apiClient.get('/analytics/overview');
  },
};