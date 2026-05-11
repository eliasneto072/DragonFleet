import { WithdrawalStatus } from '../../shared/types/enums';

export type CreateWithdrawalData = {
  amount: number;
  userId: string;
  // status omitido — Prisma usa PENDING por default
};

export type UpdateWithdrawalData = {
  status?: WithdrawalStatus;
  notes?: string | null;
};