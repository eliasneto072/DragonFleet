import { EarningPlatform, EarningStatus } from '../../shared/types/enums';

export type CreateEarningData = {
  amount: number;
  date: Date;
  platform: EarningPlatform;
  userId: string;
  status: EarningStatus;
  notes?: string | null;
  reviewedById?: string | null;
  reviewedAt?: Date | null;
};

export type UpdateEarningData = {
  amount?: number;
  date?: Date;
  platform?: EarningPlatform;
  status?: EarningStatus;
  notes?: string | null;
  reviewedById?: string | null;
  reviewedAt?: Date | null;
};
