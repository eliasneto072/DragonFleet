import { IWithdrawalPublic } from './withdrawals.types';
import { CreateWithdrawalData, UpdateWithdrawalData } from './withdrawals.repository.types';

export interface IWithdrawalRepository {
  findAll(): Promise<IWithdrawalPublic[]>;
  findById(id: string): Promise<IWithdrawalPublic | null>;
  findByUserId(userId: string): Promise<IWithdrawalPublic[]>;
  create(data: CreateWithdrawalData): Promise<IWithdrawalPublic>;
  update(id: string, data: UpdateWithdrawalData): Promise<IWithdrawalPublic>;
  delete(id: string): Promise<void>;
}