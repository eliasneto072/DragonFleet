import { EarningPlatform, EarningStatus } from '../../shared/types/enums';

export type CreateEarningInput = {
  amount: number;
  date?: Date;
  platform: EarningPlatform;
  /** Justificação do motorista: por que este valor está em falta. */
  notes?: string | null;
  // userId removido — vem do token no controller
};

export type UpdateEarningInput = {
  amount?: number;
  date?: Date;
  platform?: EarningPlatform;
  notes?: string | null;
};

export type ReviewEarningInput = {
  status: EarningStatus;
  /** Obrigatório ao recusar. */
  notes?: string | null;
};

export type ListEarningsFilter = {
  userId?: string;
  status?: EarningStatus;
  from?: Date;
  to?: Date;
};
