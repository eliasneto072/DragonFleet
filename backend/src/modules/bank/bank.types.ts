// src/modules/bank/bank.types.ts

import { UserRole } from '../../shared/types/enums';

export type Actor = { id: string; role?: UserRole };

/** Quantas contas bancárias um motorista pode ter ao mesmo tempo. */
export const MAX_BANK_ACCOUNTS = 3;

/**
 * Uma conta bancária de um motorista.
 *
 * Dois pares de campos: os em vigor e os pendentes. É isso que permite o IBAN
 * anterior continuar a valer enquanto uma alteração espera decisão — sem essa
 * separação, submeter dados novos apagaria os bons antes de alguém os validar,
 * e um engano deixaria a conta sem destino de pagamento.
 */
export interface BankAccountPublic {
  id: string;
  userId: string;

  /** O nome que o motorista deu à conta. */
  label: string | null;
  /** A que vem escolhida por omissão no pedido de retirada. */
  isPrimary: boolean;

  /** Em vigor. Null até à primeira aprovação. */
  iban: string | null;
  holderName: string | null;

  /** Submetido, à espera de decisão. */
  pendingIban: string | null;
  pendingHolderName: string | null;
  pendingAt: Date | null;

  /** Motivo da última recusa, se houver. */
  rejectionReason: string | null;

  reviewedAt: Date | null;
  updatedAt: Date | null;

  /** Derivado: há alteração à espera de decisão. */
  hasPending: boolean;
  /** Derivado: existe IBAN em vigor — esta conta pode receber uma retirada. */
  isUsable: boolean;
}

export interface SubmitBankInput {
  iban: string;
  holderName: string;
  /** Comprovativo de titularidade, obrigatório em cada submissão. */
  proofUrl: string;
  proofKey: string;
  /** Nome para a conta. Opcional; sem ele fica "Conta 1", "Conta 2"… */
  label?: string;
  /**
   * Substituir o IBAN de uma conta que já existe, em vez de criar outra.
   *
   * É a diferença entre "mudei de banco" e "tenho mais um banco". Sem isto,
   * corrigir um IBAN gastava uma das três posições.
   */
  accountId?: string;
}

export interface ReviewBankInput {
  approve: boolean;
  /** Obrigatório ao recusar. */
  reason?: string;
}

/** A conta escolhida para uma retirada, já resolvida e validada. */
export interface ChosenAccount {
  id: string;
  iban: string;
  holderName: string;
  label: string | null;
}
