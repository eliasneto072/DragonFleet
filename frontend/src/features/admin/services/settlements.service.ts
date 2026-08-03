// src/features/admin/services/settlements.service.ts
//
// Fecho semanal de faturação — a única porta pela qual entra dinheiro na conta
// do motorista.
//
// Fluxo: cria-se um rascunho, revê-se, e só o `register` credita. Depois de
// registado o fecho é imutável; para corrigir, cancela-se e cria-se outro.

import { apiClient } from '@/shared/lib/api-client';
import type { EarningPlatform, SettlementStatus } from '@/shared/types/api';

/** Valores introduzidos pelo administrador. */
export interface SettlementAmounts {
  uberAmount?: number;
  boltAmount?: number;
  otherRevenue?: number;

  tollsAmount?: number;
  fuelAmount?: number;
  vehicleFee?: number;
  otherDeductions?: number;

  /** Pontos percentuais (15 = 15%). Omitido, usa o valor das Configurações. */
  commissionRate?: number;
  /** Observações visíveis ao motorista. */
  notes?: string | null;
  /** Observações internas. Só a gestão as recebe da API. */
  internalNotes?: string | null;
}

/** Resultado do cálculo. Devolvido pelo servidor, nunca calculado aqui. */
export interface SettlementTotals {
  grossRevenue: number;
  /** Despesas operacionais, sem a comissão. */
  operatingCosts: number;
  /** Base da percentagem: receitas menos despesas operacionais. */
  profitBase: number;
  commissionAmount: number;
  /** Despesas operacionais mais a comissão. */
  totalDeductions: number;
  /** O que é creditado ao motorista — o "total da semana". */
  netToDriver: number;
}

export interface ApiSettlement extends SettlementTotals {
  id: string;
  userId: string;
  userName: string;
  vehicleId: string | null;
  vehiclePlate: string | null;
  weekStart: string;
  weekEnd: string;

  uberAmount: number;
  boltAmount: number;
  otherRevenue: number;

  tollsAmount: number;
  fuelAmount: number;
  vehicleFee: number;
  otherDeductions: number;

  commissionRate: number;
  status: SettlementStatus;
  notes: string | null;
  /** Ausente quando quem consulta é o motorista — filtrado no servidor. */
  internalNotes?: string | null;

  createdById: string;
  createdByName: string | null;
  registeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSettlementInput extends SettlementAmounts {
  userId: string;
  vehicleId?: string | null;
  /** "YYYY-MM-DD" */
  weekStart: string;
  /** "YYYY-MM-DD" */
  weekEnd: string;
}

export type UpdateSettlementInput = Omit<CreateSettlementInput, 'userId'>;

export interface ListSettlementsParams {
  userId?: string;
  status?: SettlementStatus;
  from?: string;
  to?: string;
}

/** Comunicado pelo motorista, para conferência cruzada. */
export interface ReportedByPlatform {
  platform: EarningPlatform;
  total: number;
  count: number;
}

function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const settlementsService = {
  /** GET /settlements — motorista vê os próprios; gestão vê todos. */
  list(params: ListSettlementsParams = {}): Promise<{ settlements: ApiSettlement[] }> {
    return apiClient.get(`/settlements${query(params as Record<string, string | undefined>)}`);
  },

  /** GET /settlements/:id */
  getById(id: string): Promise<{ settlement: ApiSettlement }> {
    return apiClient.get(`/settlements/${id}`);
  },

  /**
   * POST /settlements/preview — calcula sem gravar.
   *
   * O cálculo vive no servidor de propósito: replicá-lo no formulário faria a
   * tela mostrar um número e a base gravar outro no dia em que a regra mudasse
   * num lado só.
   */
  preview(input: SettlementAmounts): Promise<{
    totals: SettlementTotals & { commissionRate: number };
  }> {
    return apiClient.post('/settlements/preview', input);
  },

  /** POST /settlements — cria rascunho. Nada é creditado. */
  create(input: CreateSettlementInput): Promise<{ settlement: ApiSettlement }> {
    return apiClient.post('/settlements', input);
  },

  /** PATCH /settlements/:id — só rascunhos. */
  update(id: string, input: UpdateSettlementInput): Promise<{ settlement: ApiSettlement }> {
    return apiClient.patch(`/settlements/${id}`, input);
  },

  /** POST /settlements/:id/register — credita o motorista. */
  register(id: string): Promise<{ settlement: ApiSettlement }> {
    return apiClient.post(`/settlements/${id}/register`, {});
  },

  /** POST /settlements/:id/cancel — reverte o crédito. */
  cancel(id: string, reason?: string): Promise<{ settlement: ApiSettlement }> {
    return apiClient.post(`/settlements/${id}/cancel`, { reason });
  },

  /** DELETE /settlements/:id — só rascunhos. */
  remove(id: string): Promise<void> {
    return apiClient.delete(`/settlements/${id}`);
  },

  /**
   * GET /earnings/reported — o que o motorista comunicou na semana.
   *
   * Vive aqui e não no service de ganhos porque só o formulário do fecho o usa,
   * como conferência: se o relatório da Uber disser 109 € e o motorista tiver
   * comunicado 119 €, alguém olha antes de fechar.
   */
  reported(userId: string, from: string, to: string): Promise<{ reported: ReportedByPlatform[] }> {
    return apiClient.get(`/earnings/reported${query({ userId, from, to })}`);
  },
};
