// src/shared/services/bank.service.ts
//
// Dados bancários: o motorista submete, a administração decide.
//
// POR QUE EM shared/ E NÃO NUMA FEATURE: as duas pontas do fluxo chamam os
// mesmos endpoints. Pô-lo em features/driver obrigaria o Financeiro a importar
// de dentro da feature do motorista — que é exatamente o que já acontece com o
// withdrawalsService e está anotado como dívida na auditoria. Este nasce no
// sítio certo; o outro muda para cá quando lhe chegar a vez.

import { apiClient } from '@/shared/lib/api-client';
import type { ApiBankAccount, ApiPendingBankAccount } from '@/shared/types/api';
import type { PageInfo } from '@/app/components/ui/list-toolbar';

interface SubmitBankInput {
  iban: string;
  holderName: string;
  /** Comprovativo de titularidade. Exigido em cada submissão, não só na primeira. */
  proof: File;
}

interface ReviewBankInput {
  approve: boolean;
  /** Obrigatório ao recusar — sem ele o backend devolve NOTES_REQUIRED. */
  reason?: string;
}

export const bankService = {
  /** GET /bank/me — a conta do próprio. */
  getMine(): Promise<{ account: ApiBankAccount }> {
    return apiClient.get('/bank/me');
  },

  /** GET /bank/:userId — a administração consulta a conta de um motorista. */
  getByUser(userId: string): Promise<{ account: ApiBankAccount }> {
    return apiClient.get(`/bank/${userId}`);
  },

  /** GET /bank/pending — a fila de alterações à espera de decisão. */
  listPending(params: { search?: string; page?: number; pageSize?: number } = {}): Promise<{
    accounts: ApiPendingBankAccount[];
    page: PageInfo;
  }> {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.page && params.page > 1) q.set('page', String(params.page));
    if (params.pageSize) q.set('pageSize', String(params.pageSize));
    const qs = q.toString();
    return apiClient.get(`/bank/pending${qs ? `?${qs}` : ''}`);
  },

  /**
   * POST /bank — multipart, com o comprovativo no mesmo pedido.
   *
   * O campo do ficheiro chama-se `proof` porque é o que o `upload.single('proof')`
   * da rota espera. Qualquer outro nome faz o multer ignorar o ficheiro e o
   * servidor responder MISSING_PROOF, sem pista nenhuma de porquê.
   */
  submit(input: SubmitBankInput): Promise<{ account: ApiBankAccount }> {
    const form = new FormData();
    form.append('iban', input.iban);
    form.append('holderName', input.holderName);
    form.append('proof', input.proof);
    return apiClient.upload('/bank', form);
  },

  /** PATCH /bank/:userId/review — aprovar ou recusar. */
  review(userId: string, input: ReviewBankInput): Promise<{ account: ApiBankAccount }> {
    return apiClient.patch(`/bank/${userId}/review`, input);
  },
};
