import { IEarning, IEarningPublic } from './earnings.types';
import { CreateEarningData, UpdateEarningData } from './earnings.repository.types';

export interface IEarningRepository {
  findAll(): Promise<IEarningPublic[]>;
  findById(id: string): Promise<IEarningPublic | null>;
  findByUserId(userId: string): Promise<IEarningPublic[]>;
  create(data: CreateEarningData): Promise<IEarningPublic>;
  update(id: string, data: UpdateEarningData): Promise<IEarningPublic>;
  delete(id: string): Promise<void>;
}