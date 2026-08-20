// src/modules/bank/bank.types.ts

import { UserRole } from '../../shared/types/enums';

export type Actor = { id: string; role?: UserRole };

/**
 * Dados bancários de um motorista.
 *
 * Dois pares de campos: os em vigor e os pendentes. É isso que permite o IBAN
 * anterior continuar a valer enquanto uma alteração espera decisão — sem essa
 * separação, submeter dados novos apagaria os bons antes de alguém os validar,
 * e um engano deixaria a conta sem destino de pagamento.
 */
export interface BankAccountPublic {
  userId: string;

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
  /** Derivado: existe IBAN em vigor — o motorista pode pedir retiradas. */
  isUsable: boolean;
}

export interface SubmitBankInput {
  iban: string;
  holderName: string;
  /** Comprovativo de titularidade, obrigatório em cada submissão. */
  proofUrl: string;
  proofKey: string;
}

export interface ReviewBankInput {
  approve: boolean;
  /** Obrigatório ao recusar. */
  reason?: string;
}
