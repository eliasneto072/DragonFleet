// src/features/admin/services/balance.service.ts

import { apiClient } from '@/shared/lib/api-client';

export type AdjustmentType = 'CREDIT' | 'DEBIT';

export interface BalanceSummary {
  /**
   * Informativo: o que o motorista comunicou. NÃO entra em `available`.
   * O dinheiro vem dos fechos semanais; os lançamentos são conferência.
   */
  totalEarnings: number;
  /** Soma líquida dos fechos registados. É daqui que vem o saldo. */
  totalSettlements: number;
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
  /**
   * Opcional, como no backend: `createAdjustmentSchema` marca-o `.optional()` e
   * o service grava string vazia quando falta. O tipo dizia obrigatório e
   * obrigava quem chama a inventar um valor para o compilador aceitar.
   */
  reason?: string;
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