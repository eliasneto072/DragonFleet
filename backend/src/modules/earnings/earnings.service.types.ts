import { EarningPlatform } from '../../shared/types/enums';

export type CreateEarningInput = {
  amount: number;
  date: Date;
  platform: EarningPlatform;
  // userId removido — vem do token no controller
};

export type UpdateEarningInput = {
  amount?: number;
  date?: Date;
  platform?: EarningPlatform;
};