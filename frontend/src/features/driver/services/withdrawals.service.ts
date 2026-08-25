// src/features/driver/services/withdrawals.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { ApiWithdrawal, WithdrawalStatus } from '@/shared/types/api';

interface UpdateWithdrawalStatusInput {
  status: WithdrawalStatus;
  notes?: string;
  /**
   * Sociedade a quem o recibo verde foi emitido. Só lido pelo servidor quando
   * o estado é APPROVED. Ambos nulos significam "Nenhum" — uma escolha, e não
   * a ausência de escolha.
   */
  companyId?: string | null;
  companyOther?: string | null;
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

  /**
   * POST /withdrawals — multipart, com o recibo verde.
   *
   * O motorista vem do token; o corpo leva só o valor e o ficheiro. O campo
   * chama-se `receipt` porque é o que o `upload.single('receipt')` da rota
   * espera — qualquer outro nome faz o multer ignorá-lo e o servidor responder
   * MISSING_RECEIPT.
   *
   * O valor vai como texto e não como número: num FormData tudo é texto, e o
   * backend já o converte com `z.coerce.number()`.
   */
  create(amount: number, receipt: File): Promise<{ withdrawal: ApiWithdrawal }> {
    const form = new FormData();
    form.append('amount', String(amount));
    form.append('receipt', receipt);
    return apiClient.upload('/withdrawals', form);
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