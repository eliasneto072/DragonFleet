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
  /**
   * Imposto sobre a faturação, em pontos percentuais. Omitido, usa o valor das
   * Configurações. O formulário não o envia: o campo é calculado e só de
   * leitura. Existe para a pré-visualização poder simular outra taxa.
   */
  taxRate?: number;
  /** Observações visíveis ao motorista. */
  notes?: string | null;
  /** Observações internas. Só a gestão as recebe da API. */
  internalNotes?: string | null;
}

/** Resultado do cálculo. Devolvido pelo servidor, nunca calculado aqui. */
export interface SettlementTotals {
  grossRevenue: number;
  /** Valor sobre o qual o imposto incide: Uber + Bolt, sem outras receitas. */
  taxBase: number;
  taxAmount: number;
  /** Despesas operacionais, incluindo o imposto — sem a comissão. */
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
  /**
   * NULO nos fechos anteriores ao imposto, que é diferente de zero: zero é uma
   * taxa posta a zero de propósito. As telas usam isto para decidir se mostram
   * a linha do imposto.
   */
  taxRate: number | null;
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

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface ListSettlementsParams {
  /** Termos a casar contra o nome ou email do motorista do fecho. */
  search?: string;
  /** 1 é a primeira. Omitido, o servidor devolve a primeira. */
  page?: number;
  /** O servidor aplica um teto de 200, por muito que se peça mais. */
  pageSize?: number;
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
  /**
   * GET /settlements — motorista vê os próprios; gestão vê todos.
   *
   * Uma PÁGINA de fechos, mais os totais do filtro inteiro.
   *
   * Antes devolvia tudo. Com um ano de dados e 2000 motoristas isso eram
   * 70,4 MB e 22 segundos num pedido, para desenhar as 25 linhas que a tela
   * já limitava — o custo de desenhar tinha sido pensado, o de transferir não.
   *
   * Os `totals` vêm do servidor e cobrem TODO o filtro, não só a página: o
   * cartão do topo continua a dizer o total real, sem precisar dos 88 mil
   * objetos no browser para o somar.
   */
  list(params: ListSettlementsParams = {}): Promise<{
    settlements: ApiSettlement[];
    page: PageInfo;
    totals: { credited: number; registeredCount: number };
  }> {
    // page e pageSize são números; o query() monta texto. A conversão é
    // explícita para o `if (v)` do query() não descartar a página 0 — que não
    // existe, mas o mesmo padrão com um zero legítimo passaria despercebido.
    const { page, pageSize, ...resto } = params;
    return apiClient.get(`/settlements${query({
      ...resto as Record<string, string | undefined>,
      page: page !== undefined ? String(page) : undefined,
      pageSize: pageSize !== undefined ? String(pageSize) : undefined,
    })}`);
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
    totals: SettlementTotals & { commissionRate: number; taxRate: number };
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
