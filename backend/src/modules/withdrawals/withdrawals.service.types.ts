import { WithdrawalStatus } from '../../shared/types/enums';

export type CreateWithdrawalInput = {
  amount: number;
};

export type UpdateWithdrawalStatusInput = {
  status: WithdrawalStatus;
  notes?: string; // obrigatório se REJECTED — validado no service
};