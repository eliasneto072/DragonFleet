// src/shared/services/bank.service.ts
//
// Dados bancários: o motorista submete, a administração decide.
//
// Até três contas por motorista. As operações sobre UMA conta vão por
// identificador de conta e não por motorista — com três contas por pessoa, "a
// conta do motorista X" deixou de identificar alguma coisa.
//
// POR QUE EM shared/ E NÃO NUMA FEATURE: as duas pontas do fluxo chamam os
// mesmos endpoints. Pô-lo em features/driver obrigaria o Financeiro a importar
// de dentro da feature do motorista — que é exatamente o que já acontece com o
// withdrawalsService e está anotado como dívida na auditoria.

import { apiClient } from '@/shared/lib/api-client';
import type { ApiBankAccount, ApiPendingBankAccount } from '@/shared/types/api';
import type { PageInfo } from '@/app/components/ui/list-toolbar';

/** Quantas contas cada motorista pode ter. O servidor impõe o mesmo teto. */
export const MAX_CONTAS = 3;

interface SubmitBankInput {
  iban: string;
  holderName: string;
  /** Comprovativo de titularidade. Exigido em cada submissão, não só na primeira. */
  proof: File;
  /** Nome para a conta. */
  label?: string;
  /** Substituir o IBAN de uma conta existente, em vez de criar outra. */
  accountId?: string;
}

interface ReviewBankInput {
  approve: boolean;
  /** Obrigatório ao recusar — sem ele o backend devolve NOTES_REQUIRED. */
  reason?: string;
}

export const bankService = {
  /** GET /bank/me — as contas do próprio. */
  getMine(): Promise<{ accounts: ApiBankAccount[] }> {
    return apiClient.get('/bank/me');
  },

  /** GET /bank/:userId — a administração consulta as contas de um motorista. */
  getByUser(userId: string): Promise<{ accounts: ApiBankAccount[] }> {
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
   *
   * Sem `accountId` cria uma conta nova; com ele substitui o IBAN de uma que já
   * existe. É a diferença entre "tenho mais um banco" e "mudei de banco".
   */
  submit(input: SubmitBankInput): Promise<{ account: ApiBankAccount }> {
    const form = new FormData();
    form.append('iban', input.iban);
    form.append('holderName', input.holderName);
    form.append('proof', input.proof);
    if (input.label) form.append('label', input.label);
    if (input.accountId) form.append('accountId', input.accountId);
    return apiClient.upload('/bank', form);
  },

  /** PATCH /bank/accounts/:id/review — aprovar ou recusar uma conta. */
  review(accountId: string, input: ReviewBankInput): Promise<{ account: ApiBankAccount }> {
    return apiClient.patch(`/bank/accounts/${accountId}/review`, input);
  },

  /** PATCH /bank/accounts/:id/primary — passa a ser a conta por omissão. */
  setPrimary(accountId: string): Promise<{ accounts: ApiBankAccount[] }> {
    return apiClient.patch(`/bank/accounts/${accountId}/primary`, {});
  },

  /** PATCH /bank/accounts/:id — muda só o nome. Não passa por aprovação. */
  rename(accountId: string, label: string): Promise<{ account: ApiBankAccount }> {
    return apiClient.patch(`/bank/accounts/${accountId}`, { label });
  },

  /** DELETE /bank/accounts/:id — arquiva. O histórico fica. */
  archive(accountId: string): Promise<{ accounts: ApiBankAccount[] }> {
    return apiClient.delete(`/bank/accounts/${accountId}`);
  },
};
