// src/features/admin/services/balance.service.ts

import { apiClient } from '@/shared/lib/api-client';

export type AdjustmentType = 'CREDIT' | 'DEBIT';

export interface BalanceSummary {
  totalEarnings: number;
  totalCredits: number;
  totalDebits: number;
  totalWithdrawn: number;
  pendingWithdrawals: number;
  available: number;
}

export interface Adjustment {
  id: string;
  amount: number;
  type: AdjustmentType;
  reason: string;
  userId: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

interface CreateAdjustmentInput {
  type: AdjustmentType;
  amount: number;
  reason: string;
}

export const balanceService = {
  /** GET /balance/:userId */
  getSummary(userId: string): Promise<{ balance: BalanceSummary }> {
    return apiClient.get(`/balance/${userId}`);
  },

  /** GET /balance/:userId/adjustments */
  listAdjustments(userId: string): Promise<{ adjustments: Adjustment[] }> {
    return apiClient.get(`/balance/${userId}/adjustments`);
  },

  /** POST /balance/:userId/adjustments — admin/manager */
  createAdjustment(userId: string, input: CreateAdjustmentInput): Promise<{ adjustment: Adjustment }> {
    return apiClient.post(`/balance/${userId}/adjustments`, input);
  },
};