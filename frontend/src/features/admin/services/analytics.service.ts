// src/features/admin/services/analytics.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { EarningPlatform } from '@/shared/types/api';

export type Granularity = 'day' | 'month';

export interface ApiStats {
  range: { from: string; to: string; granularity: Granularity };
  /** Estado do cadastro — não depende do período consultado. */
  totalDrivers: number;
  activeDrivers: number;
  /** Métricas do período. */
  grossEarnings: number;
  earningsCount: number;
  /**
   * Motoristas distintos que lançaram ganhos no período. Diferente de
   * activeDrivers, que conta status = ACTIVE: alguém pode estar ativo no
   * cadastro e não trabalhar há meses.
   */
  activeInPeriod: number;
  pendingWithdrawals: number;
  earningsByPlatform: { platform: EarningPlatform; total: number; count: number }[];
  /** Bucket é "YYYY-MM-DD" ou "YYYY-MM", conforme range.granularity. */
  series: { bucket: string; total: number }[];
  topDrivers: { name: string; email: string; total: number }[];
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
};
