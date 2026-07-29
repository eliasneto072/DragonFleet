import { IEarningPublic, ReportedByPlatform } from './earnings.types';
import { CreateEarningData, UpdateEarningData } from './earnings.repository.types';
import { ListEarningsFilter } from './earnings.service.types';

export interface IEarningRepository {
  findAll(): Promise<IEarningPublic[]>;
  findMany(filter: ListEarningsFilter): Promise<IEarningPublic[]>;
  findById(id: string): Promise<IEarningPublic | null>;
  findByUserId(userId: string): Promise<IEarningPublic[]>;
  create(data: CreateEarningData): Promise<IEarningPublic>;
  update(id: string, data: UpdateEarningData): Promise<IEarningPublic>;
  delete(id: string): Promise<void>;
  /** Comunicado por plataforma num intervalo — conferência cruzada do fecho. */
  sumByPlatformInRange(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<ReportedByPlatform[]>;
}
