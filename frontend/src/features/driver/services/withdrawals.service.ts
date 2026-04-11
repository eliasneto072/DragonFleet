// src/features/driver/services/withdrawals.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { ApiWithdrawal, WithdrawalStatus } from '@/shared/types/api';

interface UpdateWithdrawalStatusInput {
  status: WithdrawalStatus;
  notes?: string;
}

export const withdrawalsService = {
  /** GET /withdrawals — lista do usuário logado (ou todos, se admin) */
  list(): Promise<{ withdrawals: ApiWithdrawal[] }> {
    return apiClient.get('/withdrawals');
  },

  /** GET /withdrawals/user/:userId */
  listByUser(userId: string): Promise<{ withdrawals: ApiWithdrawal[] }> {
    return apiClient.get(`/withdrawals/user/${userId}`);
  },

  /** GET /withdrawals/:id */
  getById(id: string): Promise<{ withdrawal: ApiWithdrawal }> {
    return apiClient.get(`/withdrawals/${id}`);
  },

  /** POST /withdrawals — driver solicita saque com o próprio id via token */
  create(amount: number): Promise<{ withdrawal: ApiWithdrawal }> {
    return apiClient.post('/withdrawals', { amount });
  },

  /** PATCH /withdrawals/:id/status — apenas admin/manager */
  updateStatus(
    id: string,
    input: UpdateWithdrawalStatusInput,
  ): Promise<{ withdrawal: ApiWithdrawal }> {
    return apiClient.patch(`/withdrawals/${id}/status`, input);
  },

  /** DELETE /withdrawals/:id */
  remove(id: string): Promise<void> {
    return apiClient.delete(`/withdrawals/${id}`);
  },
};