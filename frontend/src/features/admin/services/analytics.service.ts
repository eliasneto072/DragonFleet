// src/features/admin/services/analytics.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { EarningPlatform } from '@/shared/types/api';

export interface ApiStats {
  totalDrivers: number;
  activeDrivers: number;
  totalEarnings: number;
  pendingWithdrawals: number;
  earningsByPlatform: { platform: EarningPlatform; total: number }[];
  monthlyEarnings: { month: string; total: number }[];
}

export const analyticsService = {
  /** GET /analytics/stats — apenas admin/manager */
  getStats(): Promise<{ stats: ApiStats }> {
    return apiClient.get('/analytics/stats');
  },
};