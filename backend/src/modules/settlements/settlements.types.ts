// src/modules/settlements/settlements.types.ts

import { SettlementStatus, UserRole } from '../../shared/types/enums';

/**
 * O papel é UserRole e não string: este Actor é passado a balanceService, cujo
 * tipo é estrito. Tipá-lo como string obriga a conversões em cada chamada.
 */
export type Actor = { id: string; role?: UserRole };

/**
 * Os valores em si, sem a identificação do fecho.
 *
 * Separado de propósito: a pré-visualização calcula sem motorista nem semana,
 * e a edição não recebe motorista — esse vem do registo existente. Um tipo
 * único a exigir os três obrigava a inventar campos nas duas operações.
 */
export interface SettlementAmounts {
  uberAmount?: number;
  boltAmount?: number;
  otherRevenue?: number;

  tollsAmount?: number;
  fuelAmount?: number;
  vehicleFee?: number;
  otherDeductions?: number;

  /** Pontos percentuais (15 = 15%). Omitido, usa o valor das configurações. */
  commissionRate?: number;
  notes?: string | null;
}

/** Edição de rascunho: pode mover a semana e o veículo, não o motorista. */
export interface SettlementUpdateInput extends SettlementAmounts {
  vehicleId?: string | null;
  weekStart: string;  // "YYYY-MM-DD"
  weekEnd: string;    // "YYYY-MM-DD"
}

/** Criação: acrescenta o motorista. */
export interface SettlementInput extends SettlementUpdateInput {
  userId: string;
}

/** Resultado do cálculo, guardado no fecho ao registar. */
export interface SettlementTotals {
  grossRevenue: number;
  /** Despesas operacionais, sem a comissão. */
  operatingCosts: number;
  /** Base da percentagem: receitas menos despesas operacionais. */
  profitBase: number;
  commissionAmount: number;
  /** Despesas operacionais mais a comissão — o que a tela mostra como total. */
  totalDeductions: number;
  /** O que é creditado ao motorista. */
  netToDriver: number;
}

export interface SettlementPublic extends SettlementTotals {
  id: string;
  userId: string;
  userName: string;
  vehicleId: string | null;
  vehiclePlate: string | null;
  weekStart: Date;
  weekEnd: Date;

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

  createdById: string;
  createdByName: string | null;
  registeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Arredonda a duas casas, evitando os resíduos do ponto flutuante. */
function cents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Cálculo do fecho. Ponto único de verdade — usado na pré-visualização, ao
 * gravar rascunho e ao registar, para que o que o administrador vê seja
 * exatamente o que é gravado.
 *
 * A percentagem incide sobre o LUCRO, não sobre o bruto. Nas palavras do
 * cliente: "motorista fez 100€ Uber e 100€ Bolt, isso dá 200€; gastou 50€ em
 * gasóleo e 50€ em via verde, o resultado é 100€; a percentagem vai ser sobre
 * os 100€ de lucro e não dos 200€".
 *
 * Sobre uma semana em prejuízo (despesas acima das receitas), a comissão é
 * zero: não se cobra percentagem de um resultado negativo. O líquido fica
 * negativo, e é isso mesmo — a despesa foi real e alguém a pagou.
 */
export function computeTotals(
  input: SettlementAmounts & { commissionRate: number },
): SettlementTotals {
  const grossRevenue = cents(
    (input.uberAmount ?? 0) + (input.boltAmount ?? 0) + (input.otherRevenue ?? 0),
  );

  const operatingCosts = cents(
    (input.tollsAmount ?? 0) + (input.fuelAmount ?? 0) +
    (input.vehicleFee ?? 0) + (input.otherDeductions ?? 0),
  );

  const profitBase = cents(grossRevenue - operatingCosts);

  const commissionAmount = profitBase > 0
    ? cents(profitBase * (input.commissionRate / 100))
    : 0;

  const netToDriver = cents(profitBase - commissionAmount);
  const totalDeductions = cents(operatingCosts + commissionAmount);

  return {
    grossRevenue,
    operatingCosts,
    profitBase,
    commissionAmount,
    totalDeductions,
    netToDriver,
  };
}
