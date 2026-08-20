import { WithdrawalStatus } from '../../shared/types/enums';
import { IUserPublic } from '../users/users.types';

export interface IWithdrawal {
  id: string;
  amount: number;
  status: WithdrawalStatus;
  notes?: string | null;
  requestedAt: Date;
  processedAt?: Date | null;
  userId: string;

  /** Recibo verde, anexado no momento do pedido. */
  receiptUrl: string;
  receiptKey: string;

  /**
   * IBAN de destino, copiado na APROVAÇÃO.
   *
   * Congelado de propósito: se o motorista alterar os dados bancários depois,
   * uma transferência já decidida não pode mudar de destino sem ninguém
   * reparar. Mesma lógica da percentagem no fecho semanal.
   */
  paidToIban?: string | null;
  paidToHolder?: string | null;
}

export type IWithdrawalPublic = IWithdrawal;

export type IWithdrawalWithUser = IWithdrawal & {
  user?: IUserPublic;
};
