import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { IWithdrawalPublic } from './withdrawals.types';
import { IWithdrawalRepository } from './withdrawals.repository.interfaces';
import { CreateWithdrawalData, UpdateWithdrawalData } from './withdrawals.repository.types';

export class WithdrawalsRepository implements IWithdrawalRepository {
  private readonly publicSelect = {
    id: true,
    amount: true,
    status: true,
    notes: true,
    requestedAt: true,
    processedAt: true,
    userId: true,
  } as const;

  async findAll(): Promise<IWithdrawalPublic[]> {
    try {
      const withdrawals = await prisma.withdrawal.findMany({
        select: this.publicSelect,
        orderBy: { requestedAt: 'desc' },
      });

      return withdrawals.map((w) => ({ ...w, amount: w.amount.toNumber() }));
    } catch (err) {
      logger.error('Erro ao buscar saques', err);
      throw err;
    }
  }

  async findById(id: string): Promise<IWithdrawalPublic | null> {
    try {
      const withdrawal = await prisma.withdrawal.findUnique({
        where: { id },
        select: this.publicSelect,
      });

      if (!withdrawal) return null;

      return { ...withdrawal, amount: withdrawal.amount.toNumber() };
    } catch (err) {
      logger.error('Erro ao buscar saque por id', err);
      throw err;
    }
  }

  async findByUserId(userId: string): Promise<IWithdrawalPublic[]> {
    try {
      const withdrawals = await prisma.withdrawal.findMany({
        where: { userId },
        select: this.publicSelect,
        orderBy: { requestedAt: 'desc' },
      });

      return withdrawals.map((w) => ({ ...w, amount: w.amount.toNumber() }));
    } catch (err) {
      logger.error('Erro ao buscar saques por utilizador', err);
      throw err;
    }
  }

  async create(data: CreateWithdrawalData): Promise<IWithdrawalPublic> {
    try {
      const withdrawal = await prisma.withdrawal.create({
        data: {
          amount: data.amount,
          userId: data.userId,
          // status omitido — Prisma aplica PENDING por default
        },
        select: this.publicSelect,
      });

      return { ...withdrawal, amount: withdrawal.amount.toNumber() };
    } catch (err) {
      logger.error('Erro ao criar saque', err);
      throw err;
    }
  }

  async update(id: string, data: UpdateWithdrawalData): Promise<IWithdrawalPublic> {
    try {
      const withdrawal = await prisma.withdrawal.update({
        where: { id },
        data: {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          // processedAt preenchido automaticamente quando status muda para APPROVED, REJECTED ou PAID
          ...(data.status !== undefined ? { processedAt: new Date() } : {}),
        },
        select: this.publicSelect,
      });

      return { ...withdrawal, amount: withdrawal.amount.toNumber() };
    } catch (err) {
      logger.error('Erro ao atualizar saque', err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.withdrawal.delete({ where: { id } });
    } catch (err) {
      logger.error('Erro ao deletar saque', err);
      throw err;
    }
  }
}

export const withdrawalsRepository = new WithdrawalsRepository();