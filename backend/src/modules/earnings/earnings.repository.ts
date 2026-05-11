import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { IEarningRepository } from './earnings.repository.interfaces';
import { CreateEarningData, UpdateEarningData } from './earnings.repository.types';
import { IEarningPublic } from './earnings.types';

export class EarningRepository implements IEarningRepository {
  private readonly publicSelect = {
    id: true,
    amount: true,
    date: true,
    platform: true,
    userId: true,
    createdAt: true,
  } as const;

  async findAll(): Promise<IEarningPublic[]> {
    try {
      const earnings = await prisma.earning.findMany({
        select: this.publicSelect,
        orderBy: { createdAt: 'desc' },
      });

      return earnings.map((e) => ({ ...e, amount: e.amount.toNumber() }));
    } catch (err) {
      logger.error('Erro ao buscar ganhos', err);
      throw err;
    }
  }

  async findById(id: string): Promise<IEarningPublic | null> {
    try {
      const earning = await prisma.earning.findUnique({
        where: { id },
        select: this.publicSelect,
      });

      if (!earning) return null;

      return { ...earning, amount: earning.amount.toNumber() };
    } catch (err) {
      logger.error('Erro ao buscar ganho por id', err);
      throw err;
    }
  }

  async findByUserId(userId: string): Promise<IEarningPublic[]> {
    try {
      const earnings = await prisma.earning.findMany({
        where: { userId },
        select: this.publicSelect,
        orderBy: { date: 'desc' },
      });

      return earnings.map((e) => ({ ...e, amount: e.amount.toNumber() }));
    } catch (err) {
      logger.error('Erro ao buscar ganhos por usuário', err);
      throw err;
    }
  }

  async create(data: CreateEarningData): Promise<IEarningPublic> {
    try {
      const earning = await prisma.earning.create({
        data: {
          amount: data.amount,
          date: data.date,
          platform: data.platform,
          userId: data.userId,
        },
        select: this.publicSelect,
      });

      return { ...earning, amount: earning.amount.toNumber() };
    } catch (err) {
      logger.error('Erro ao criar ganho', err);
      throw err;
    }
  }

  async update(id: string, data: UpdateEarningData): Promise<IEarningPublic> {
    try {
      const earning = await prisma.earning.update({
        where: { id },
        data: {
          ...(data.amount !== undefined ? { amount: data.amount } : {}),
          ...(data.date !== undefined ? { date: data.date } : {}),
          ...(data.platform !== undefined ? { platform: data.platform } : {}),
        },
        select: this.publicSelect,
      });

      return { ...earning, amount: earning.amount.toNumber() };
    } catch (err) {
      logger.error('Erro ao atualizar ganho', err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.earning.delete({ where: { id } });
    } catch (err) {
      logger.error('Erro ao deletar ganho', err);
      throw err;
    }
  }
}

export const earningsRepository = new EarningRepository();