import { WithdrawalStatus } from '../../shared/types/enums';

export type CreateWithdrawalData = {
  amount: number;
  userId: string;
  /** Obrigatório: a empresa não paga sem fatura. */
  receiptUrl: string;
  receiptKey: string;
  // status omitido — Prisma usa PENDING por default
};

export type UpdateWithdrawalData = {
  status?: WithdrawalStatus;
  notes?: string | null;
  processedAt?: Date | null;
  paidToIban?: string | null;
  paidToHolder?: string | null;
};
