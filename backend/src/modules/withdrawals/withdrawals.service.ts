// src/modules/withdrawals/withdrawals.service.ts
import { AppError }             from '../../shared/errors/AppError';
import { UserRole, WithdrawalStatus } from '../../shared/types/enums';
import { usersRepository }      from '../users/users.repository';
import { IWithdrawalPublic }    from './withdrawals.types';
import { withdrawalsRepository } from './withdrawals.repository';
import { CreateWithdrawalData, UpdateWithdrawalData } from './withdrawals.repository.types';
import { CreateWithdrawalInput, UpdateWithdrawalStatusInput } from './withdrawals.service.types';
import { emailService }         from '../../shared/services/email.service';

type Actor = { id: string; role?: UserRole };

function canManageWithdrawals(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

const FINAL_STATUSES: WithdrawalStatus[] = [WithdrawalStatus.PAID, WithdrawalStatus.REJECTED];

export class WithdrawalsService {
  private async ensureWithdrawalExists(id: string): Promise<IWithdrawalPublic> {
    const withdrawal = await withdrawalsRepository.findById(id);
    if (!withdrawal) throw new AppError('Withdrawal not found', 404, 'WITHDRAWAL_NOT_FOUND');
    return withdrawal;
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await usersRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  async list(actor: Actor): Promise<IWithdrawalPublic[]> {
    if (canManageWithdrawals(actor.role)) return withdrawalsRepository.findAll();
    return withdrawalsRepository.findByUserId(actor.id);
  }

  async listByUser(actor: Actor, userId: string): Promise<IWithdrawalPublic[]> {
    if (!canManageWithdrawals(actor.role) && actor.id !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    await this.ensureUserExists(userId);
    return withdrawalsRepository.findByUserId(userId);
  }

  async getById(actor: Actor, id: string): Promise<IWithdrawalPublic> {
    const withdrawal = await this.ensureWithdrawalExists(id);
    if (!canManageWithdrawals(actor.role) && withdrawal.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    return withdrawal;
  }

  async create(actor: Actor, userId: string, input: CreateWithdrawalInput): Promise<IWithdrawalPublic> {
    if (!canManageWithdrawals(actor.role) && userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'CANNOT_CREATE_WITHDRAWAL_FOR_ANOTHER_USER');
    }
    await this.ensureUserExists(userId);
    const data: CreateWithdrawalData = { amount: input.amount, userId };
    return withdrawalsRepository.create(data);
  }

  async updateStatus(actor: Actor, id: string, input: UpdateWithdrawalStatusInput): Promise<IWithdrawalPublic> {
    if (!canManageWithdrawals(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const withdrawal = await this.ensureWithdrawalExists(id);

    if (FINAL_STATUSES.includes(withdrawal.status)) {
      throw new AppError(
        `Cannot change status of a ${withdrawal.status} withdrawal`,
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }

    if (input.status === WithdrawalStatus.REJECTED && !input.notes) {
      throw new AppError('Notes are required when rejecting a withdrawal', 400, 'NOTES_REQUIRED');
    }

    const data: UpdateWithdrawalData = {
      status: input.status,
      notes:  input.notes ?? null,
    };

    const updated = await withdrawalsRepository.update(id, data);

    // ── Disparar email ao driver ──────────────────────────────────────────
    try {
      const user   = await usersRepository.findById(withdrawal.userId);
      const amount = Number(withdrawal.amount);

      if (user?.email) {
        if (input.status === WithdrawalStatus.APPROVED || input.status === WithdrawalStatus.PAID) {
          await emailService.sendWithdrawalApproved(user.email, user.name, amount);
        } else if (input.status === WithdrawalStatus.REJECTED) {
          await emailService.sendWithdrawalRejected(user.email, user.name, amount, input.notes);
        }
      }
    } catch (emailErr) {
      console.error('[email] Failed to send withdrawal status email:', emailErr);
    }

    return updated;
  }

  async remove(actor: Actor, id: string): Promise<void> {
    if (!canManageWithdrawals(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    await this.ensureWithdrawalExists(id);
    return withdrawalsRepository.delete(id);
  }
}

export const withdrawalsService = new WithdrawalsService();