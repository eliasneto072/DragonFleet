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

  /**
   * A quem foi emitido o recibo verde. Só lido quando o estado é APPROVED.
   *
   * Os dois ausentes significam "Nenhum" — uma escolha, não uma omissão. Os
   * dois preenchidos são erro: validado no service.
   */
  companyId?: string | null;
  companyOther?: string | null;
};
