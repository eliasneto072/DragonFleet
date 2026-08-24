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
  /**
   * Imposto sobre a faturação, em pontos percentuais. Omitido, usa o valor das
   * configurações.
   *
   * Não é um campo que o administrador preencha: o valor é calculado sobre as
   * receitas da Uber e da Bolt e mostrado só de leitura. Existe aqui para a
   * pré-visualização poder simular uma taxa diferente, e para o fecho gravar a
   * que foi efetivamente aplicada.
   */
  taxRate?: number;
  /** Observações visíveis ao motorista. */
  notes?: string | null;
  /** Observações internas. Só a gestão as vê. */
  internalNotes?: string | null;
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
  /**
   * Valor sobre o qual o imposto incidiu: Uber + Bolt.
   *
   * Guardado à parte do resultado porque, sem ele, ninguém consegue reconstruir
   * daqui a um ano sobre que valor a taxa foi aplicada.
   */
  taxBase: number;
  taxAmount: number;
  /** Despesas operacionais, incluindo o imposto — sem a comissão. */
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
  /**
   * Taxa aplicada. NULO nos fechos anteriores à existência do imposto — o que
   * é diferente de zero, que significa taxa posta a zero de propósito.
   */
  taxRate: number | null;
  status: SettlementStatus;
  notes: string | null;
  /**
   * Só presente quando quem consulta é gestão. Para o motorista o campo é
   * omitido na origem, no repositório — não escondido na interface, que seria
   * uma proteção que a próxima tela esqueceria.
   */
  internalNotes?: string | null;

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
 *
 * ── O IMPOSTO ────────────────────────────────────────────────────────────────
 *
 * Pedido do cliente, textualmente: "esse campo eu preciso que ele cobre 6% do
 * valor bruto da Uber e Bolt (...) Formula: Valor do campo Uber + Valor do
 * Campo Bolt x 6% (...) Isto deve alterar tmb a fórmula do último campo (valor
 * a receber) pois tem de adicionar este nova despesa de motorista".
 *
 * Duas consequências, e nenhuma é acidental:
 *
 * 1. A BASE É uber + bolt, e não o grossRevenue. O otherRevenue fica de fora
 *    porque foi o que ele escreveu. Usar o bruto total tributaria receita que
 *    ele não mandou tributar, e a diferença sai do bolso do motorista.
 *
 * 2. O IMPOSTO ENTRA NAS DESPESAS, antes da comissão. Ele chamou-lhe "despesa
 *    de motorista", e neste sistema "despesa" já tem significado fixo: é o que
 *    entra no operatingCosts ao lado da Via Verde e do combustível. Isto faz a
 *    comissão incidir sobre o lucro DEPOIS do imposto — que é o correto se
 *    este valor for mesmo devido ao Estado, porque então nunca foi receita de
 *    ninguém e cobrar percentagem sobre ele seria cobrar percentagem sobre
 *    dinheiro alheio. Com 1000 € de bruto, 200 € de outras despesas e 15%, dá
 *    60 € de imposto e 629 € ao motorista; a alternativa de descontar depois da
 *    comissão daria 620 €.
 *
 * POR CONFIRMAR com o contabilista do cliente: se os campos Uber e Bolt
 * guardarem o líquido que a plataforma transfere, e não o bruto pago pelo
 * passageiro, 6% sobre eles não é o IVA devido — o IVA incide sobre o preço da
 * viagem, antes da comissão da plataforma. É por isso que taxBase é gravado
 * separadamente: se a resposta mudar a interpretação, muda o cálculo da base e
 * o histórico permanece.
 */
export function computeTotals(
  input: SettlementAmounts & { commissionRate: number; taxRate: number },
): SettlementTotals {
  const grossRevenue = cents(
    (input.uberAmount ?? 0) + (input.boltAmount ?? 0) + (input.otherRevenue ?? 0),
  );

  // Só Uber e Bolt. Ver o ponto 1 acima.
  const taxBase = cents((input.uberAmount ?? 0) + (input.boltAmount ?? 0));
  const taxAmount = cents(taxBase * (input.taxRate / 100));

  const operatingCosts = cents(
    (input.tollsAmount ?? 0) + (input.fuelAmount ?? 0) +
    (input.vehicleFee ?? 0) + (input.otherDeductions ?? 0) +
    taxAmount,
  );

  const profitBase = cents(grossRevenue - operatingCosts);

  const commissionAmount = profitBase > 0
    ? cents(profitBase * (input.commissionRate / 100))
    : 0;

  const netToDriver = cents(profitBase - commissionAmount);
  const totalDeductions = cents(operatingCosts + commissionAmount);

  return {
    grossRevenue,
    taxBase,
    taxAmount,
    operatingCosts,
    profitBase,
    commissionAmount,
    totalDeductions,
    netToDriver,
  };
}
