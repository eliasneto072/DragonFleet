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

export type LedgerKind = 'SETTLEMENT' | 'CREDIT' | 'DEBIT' | 'WITHDRAWAL';

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  /**
   * A data que ancora a linha: a semana no fecho, a data do PEDIDO na retirada.
   *
   * Nunca a data da decisão — essa é reescrita a cada mudança de estado, e uma
   * linha ancorada nela muda de sítio quando a retirada passa de aprovada a
   * paga, arrastando o saldo de todas as linhas pelo meio.
   */
  date: string;
  label: string;
  detail?: string | null;
  /** Assinado: positivo entra, negativo sai. */
  amount: number;
  /** O saldo em conta DEPOIS deste movimento. */
  balance: number;
  settlementId?: string;
}

export interface LedgerReconciliation {
  /** A última linha do extrato. NÃO é o disponível — ver nota abaixo. */
  accountBalance: number;
  pendingWithdrawals: number;
  /** O que o portal do motorista mostra como "disponível para retirada". */
  availableToWithdraw: number;
}

export const balanceService = {
  /**
   * GET /balance/:userId/ledger — os movimentos e o saldo depois de cada um.
   *
   * ─── PORQUE HÁ TRÊS NÚMEROS E NÃO UM ─────────────────────────────────────
   *
   * O extrato inclui as retiradas pagas e aprovadas, e NÃO as pendentes: uma
   * pendente ainda pode ser recusada, e uma linha que pode desaparecer é pior
   * do que não a mostrar.
   *
   * A consequência é que a última linha não é o saldo disponível — é o
   * disponível MAIS o que está reservado por pedidos por decidir. Por isso a
   * coluna se chama "Saldo em conta" e nunca "disponível", e por isso a tela
   * mostra os três juntos.
   */
  getLedger(userId: string): Promise<{
    entries: LedgerEntry[];
    reconciliation: LedgerReconciliation;
  }> {
    return apiClient.get(`/balance/${userId}/ledger`);
  },

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