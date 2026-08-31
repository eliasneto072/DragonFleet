// src/shared/services/companies.service.ts
//
// Sociedades a quem os motoristas emitem recibo verde.
//
// Em shared/services/ e não numa feature porque duas telas o usam: o seletor
// no diálogo de aprovação, no Financeiro, e a tela de Recibos Verdes. Mesmo
// raciocínio do bank.service — um serviço partilhado alojado dentro de uma
// feature obriga a outra a importar de lá, que é a dívida já anotada no
// withdrawalsService.

import { apiClient } from '@/shared/lib/api-client';
import type { ApiCompany, ApiWithdrawal } from '@/shared/types/api';

export const companiesService = {
  /**
   * GET /companies — as sociedades ativas, para classificar um recibo.
   *
   * `all` traz também as desativadas, e só a tela de gestão o usa: quem está a
   * classificar não deve poder escolher uma sociedade que já não opera.
   */
  list(all = false): Promise<{ companies: ApiCompany[] }> {
    return apiClient.get(`/companies${all ? '?all=1' : ''}`);
  },

  create(name: string): Promise<{ company: ApiCompany }> {
    return apiClient.post('/companies', { name });
  },

  update(id: string, data: { name?: string; active?: boolean }): Promise<{ company: ApiCompany }> {
    return apiClient.patch(`/companies/${id}`, data);
  },

  /** Só passa quando a sociedade ainda não tem recibos. Senão, desativar. */
  remove(id: string): Promise<{ deleted: boolean }> {
    return apiClient.delete(`/companies/${id}`);
  },

  /**
   * PATCH /withdrawals/:id/company — corrigir a sociedade depois da aprovação,
   * ou classificar uma retirada anterior a este campo.
   *
   * Os dois campos ausentes significam "Nenhum", que é uma escolha e não uma
   * omissão: o servidor grava a data e é ela que os distingue.
   */
  setWithdrawalCompany(
    withdrawalId: string,
    input: { companyId?: string | null; companyOther?: string | null },
  ): Promise<{ withdrawal: ApiWithdrawal }> {
    return apiClient.patch(`/withdrawals/${withdrawalId}/company`, input);
  },
};

/**
 * Como mostrar a classificação de uma retirada.
 *
 * Ponto único de verdade: a mesma retirada tem de ler igual no Financeiro e na
 * tela de Recibos Verdes, e a distinção entre "Nenhum" e "por classificar" é
 * fácil de perder se cada tela a resolver por si.
 */
export function describeCompany(w: {
  companyName?: string | null;
  companyOther?: string | null;
  companySetAt?: string | null;
}): { label: string; classified: boolean } {
  if (w.companyName) return { label: w.companyName, classified: true };
  if (w.companyOther) return { label: w.companyOther, classified: true };
  if (w.companySetAt) return { label: 'Nenhum', classified: true };
  return { label: 'Por classificar', classified: false };
}
