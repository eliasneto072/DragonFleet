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
}

export type IWithdrawalPublic = IWithdrawal;

export type IWithdrawalWithUser = IWithdrawal & {
  user?: IUserPublic;
};