// src/features/admin/services/expenses.service.ts
//
// Combustível (Prio) e portagens (Via Verde), importados pela extensão.
//
// Nenhum destes valores entra sozinho num fecho. O formulário mostra-os e o
// administrador decide usá-los — é o mesmo princípio dos ganhos comunicados:
// o que vem de fora é conferência até alguém o confirmar.

import { apiClient } from '@/shared/lib/api-client';

export type ExpenseSource = 'PRIO' | 'VIA_VERDE';
export type ExpenseCategory = 'FUEL' | 'TOLL' | 'PARKING' | 'FEE' | 'OTHER';
export type ExpenseMatch = 'CARD' | 'PLATE' | 'MANUAL';

export interface ExpenseMovementLine {
  id: string;
  category: ExpenseCategory;
  occurredAt: string;
  description: string;
  plate: string | null;
  amount: number;
  statusText: string | null;
  chargeable: boolean;
  matchedBy: ExpenseMatch | null;
}

export interface ExpenseBlock {
  /** Os dias de movimento que este fecho leva. Na Via Verde é a semana anterior. */
  range: { from: string; to: string };
  movements: ExpenseMovementLine[];
  /** Só as linhas que se descontam. */
  chargeableTotal: number;
}

export interface ExpensesForSettlement {
  weekStart: string;
  fuel: ExpenseBlock;
  tolls: ExpenseBlock;
}

/** Movimento da fila: sem motorista, tal como a base o devolve. */
export interface UnmatchedMovement {
  id: string;
  source: ExpenseSource;
  category: ExpenseCategory;
  occurredAt: string;
  day: string;
  settlementWeek: string;
  plate: string | null;
  cardNumber: string | null;
  identifier: string | null;
  description: string;
  amount: string | number;
  statusText: string | null;
  chargeable: boolean;
  createdAt: string;
}

export interface FuelCard {
  id: string;
  provider: ExpenseSource;
  number: string;
  label: string | null;
  userId: string | null;
  vehicleId: string | null;
  active: boolean;
  createdAt: string;
}

export interface SaveFuelCardInput {
  number: string;
  label?: string | null;
  userId?: string | null;
  vehicleId?: string | null;
  active?: boolean;
}

export const expensesService = {
  forSettlement: (userId: string, weekStart: string) =>
    apiClient.get<ExpensesForSettlement>(
      `/expenses/for-settlement?userId=${encodeURIComponent(userId)}&weekStart=${weekStart}`,
    ),

  unmatched: () =>
    apiClient.get<{ movements: UnmatchedMovement[] }>('/expenses/unmatched'),

  /** Atribuir a um motorista (ou tirar), ou mudar o "descontar ou não". */
  updateMovement: (id: string, body: { userId?: string | null; chargeable?: boolean }) =>
    apiClient.patch<{ movement: UnmatchedMovement }>(`/expenses/movements/${id}`, body),

  listCards: (filtro: { userId?: string; vehicleId?: string }) => {
    const q = new URLSearchParams();
    if (filtro.userId) q.set('userId', filtro.userId);
    if (filtro.vehicleId) q.set('vehicleId', filtro.vehicleId);
    return apiClient.get<{ cards: FuelCard[] }>(`/expenses/cards?${q.toString()}`);
  },

  createCard: (body: SaveFuelCardInput) =>
    apiClient.post<{ card: FuelCard }>('/expenses/cards', body),

  updateCard: (id: string, body: SaveFuelCardInput) =>
    apiClient.patch<{ card: FuelCard }>(`/expenses/cards/${id}`, body),

  /** Apagar. O que já foi importado com este cartão fica como estava. */
  deleteCard: (id: string) =>
    apiClient.delete<void>(`/expenses/cards/${id}`),
};

/** "7824000011112222" → "7824 0000 1111 2222", como vem impresso no cartão. */
export function formatCardNumber(n: string): string {
  return n.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
}

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  FUEL: 'Combustível',
  TOLL: 'Portagem',
  PARKING: 'Estacionamento',
  FEE: 'Mensalidade',
  OTHER: 'Outro',
};

export const SOURCE_LABELS: Record<ExpenseSource, string> = {
  PRIO: 'Prio',
  VIA_VERDE: 'Via Verde',
};
