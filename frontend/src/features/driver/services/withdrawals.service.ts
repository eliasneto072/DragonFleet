// src/features/driver/services/withdrawals.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { ApiWithdrawal, WithdrawalStatus } from '@/shared/types/api';
import type { PageInfo } from '@/app/components/ui/list-toolbar';

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
  /**
   * GET /withdrawals — uma PÁGINA. O motorista vê as próprias; a gestão vê
   * todas e pode procurar por nome.
   */
  list(params: {
    status?: string; search?: string; page?: number; pageSize?: number;
    /**
     * Sociedade. Aceita o valor especial de "por classificar" — o mesmo que o
     * servidor conhece. Vive no pedido e nao no cliente desde que se descobriu
     * que filtrar a pagina carregada mostrava zero linhas com o pager a dizer
     * "1-25 de 2004".
     */
    companyId?: string;
  } = {}): Promise<{
    withdrawals: ApiWithdrawal[];
    page: PageInfo;
    /**
     * Totais do FILTRO INTEIRO, nao da pagina.
     *
     * `unclassified` sao as retiradas sem sociedade registada. Vem contado em
     * SQL porque a tela dos Recibos Verdes o contava percorrendo a pagina, e
     * anunciava 22 quando a base tinha 2000 — um numero que subestimava
     * trabalho pendente.
     */
    totals?: { unclassified: number };
  }> {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.search) q.set('search', params.search);
    if (params.page && params.page > 1) q.set('page', String(params.page));
    if (params.pageSize) q.set('pageSize', String(params.pageSize));
    if (params.companyId) q.set('companyId', params.companyId);
    const qs = q.toString();
    return apiClient.get(`/withdrawals${qs ? `?${qs}` : ''}`);
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