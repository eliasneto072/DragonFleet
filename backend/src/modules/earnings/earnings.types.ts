import { EarningPlatform, EarningStatus } from '../../shared/types/enums';
import { IUserPublic } from '../users/users.types';

export interface IEarning {
  id: string;
  amount: number;
  date: Date;
  platform: EarningPlatform;
  /**
   * Estado da comunicação. NÃO afeta saldo em nenhum estado — o dinheiro entra
   * apenas pelo fecho semanal. Aprovado significa "confere com o que vou
   * fechar"; recusado, "não bate, e o motivo é este".
   */
  status: EarningStatus;
  /** Justificação do motorista, ou motivo da recusa. */
  notes: string | null;
  userId: string;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IEarningPublic = IEarning;

export type IEarningWithUser = IEarning & {
  user?: IUserPublic;
};

/** Total comunicado por plataforma num intervalo — conferência do fecho. */
export interface ReportedByPlatform {
  platform: EarningPlatform;
  total: number;
  count: number;
}
