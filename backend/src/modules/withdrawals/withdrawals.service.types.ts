import { WithdrawalStatus } from '../../shared/types/enums';

export type CreateWithdrawalInput = {
  amount: number;
  /** Recibo verde. Sem ele não há pedido. */
  receiptUrl: string;
  receiptKey: string;
};

export type UpdateWithdrawalStatusInput = {
  status: WithdrawalStatus;
  notes?: string; // obrigatório se REJECTED — validado no service
};
