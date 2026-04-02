import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import { usersRepository } from '../users/users.repository';
import { CreateEarningData, UpdateEarningData } from './earnings.repository.types';
import { earningsRepository } from './earnings.repository';
import { CreateEarningInput, UpdateEarningInput } from './earnings.service.types';
import { IEarningPublic } from './earnings.types';

type Actor = {
  id: string;
  role?: UserRole;
};

function canManageEarnings(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export class EarningsService {
  private async ensureEarningExists(id: string): Promise<IEarningPublic> {
    const earning = await earningsRepository.findById(id);

    if (!earning) {
      throw new AppError('Earning not found', 404, 'EARNING_NOT_FOUND');
    }

    return earning;
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await usersRepository.findById(userId);

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
  }

  async list(actor: Actor): Promise<IEarningPublic[]> {
    if (canManageEarnings(actor.role)) {
      return earningsRepository.findAll();
    }

    return earningsRepository.findByUserId(actor.id); 
  }

  async listByUser(actor: Actor, userId: string): Promise<IEarningPublic[]> {
    if (!canManageEarnings(actor.role) && actor.id !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    await this.ensureUserExists(userId);

    return earningsRepository.findByUserId(userId);
  }

  async getById(actor: Actor, id: string): Promise<IEarningPublic> {
    const earning = await this.ensureEarningExists(id);

    if (!canManageEarnings(actor.role) && earning.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    return earning;
  }

  // userId vem do controller (token ou body se admin especificar)
  async create(actor: Actor, userId: string, input: CreateEarningInput): Promise<IEarningPublic> {
    if (!canManageEarnings(actor.role) && userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'CANNOT_CREATE_EARNING_FOR_ANOTHER_USER');
    }

    await this.ensureUserExists(userId);

    const data: CreateEarningData = {
      amount: input.amount,
      date: input.date ?? new Date(),
      platform: input.platform,
      userId,
    };

    return earningsRepository.create(data);
  }

  async update(actor: Actor, id: string, input: UpdateEarningInput): Promise<IEarningPublic> {
    
    const earning = await earningsRepository.findById(id)
    
    if (!earning) {
      throw new AppError('Earning not found', 404, 'NOT_FOUND')
    }
    
    if (!canManageEarnings(actor.role) && earning.userId !== actor.id ) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    await this.ensureEarningExists(id);

    const data: UpdateEarningData = {
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.date !== undefined ? { date: input.date } : {}),
      ...(input.platform !== undefined ? { platform: input.platform } : {}),
    };

    return earningsRepository.update(id, data);
  }

  async remove(actor: Actor, id: string): Promise<void> {

    const earning = await this.ensureEarningExists(id)

    if (!canManageEarnings(actor.role) && earning.userId !== actor.id ) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    await this.ensureEarningExists(id);

    return earningsRepository.delete(id);
  }
}

export const earningsService = new EarningsService();