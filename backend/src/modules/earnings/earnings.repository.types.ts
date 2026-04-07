import { EarningPlatform } from '../../shared/types/enums';

export type CreateEarningData = {
  amount: number;
  date: Date;
  platform: EarningPlatform;
  userId: string;
};

export type UpdateEarningData = {
  amount?: number;
  date?: Date;
  platform?: EarningPlatform;
};