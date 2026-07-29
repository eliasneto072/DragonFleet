import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { EarningPlatform, EarningStatus } from '../../shared/types/enums';
import { IEarningRepository } from './earnings.repository.interfaces';
import { CreateEarningData, UpdateEarningData } from './earnings.repository.types';
import { IEarningPublic, ReportedByPlatform } from './earnings.types';
import { ListEarningsFilter } from './earnings.service.types';

export class EarningRepository implements IEarningRepository {
  private readonly publicSelect = {
    id: true,
    amount: true,
    date: true,
    platform: true,
    status: true,
    notes: true,
    userId: true,
    reviewedById: true,
    reviewedAt: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  private toPublic(e: {
    amount: { toNumber(): number };
    [k: string]: unknown;
  }): IEarningPublic {
    return { ...(e as unknown as IEarningPublic), amount: e.amount.toNumber() };
  }

  async findAll(): Promise<IEarningPublic[]> {
    try {
      const earnings = await prisma.earning.findMany({
        select: this.publicSelect,
        orderBy: { createdAt: 'desc' },
      });
      return earnings.map((e) => this.toPublic(e));
    } catch (err) {
      logger.error('Erro ao buscar ganhos', err);
      throw err;
    }
  }

  /**
   * Listagem com filtros. Serve a fila de revisão do administrador
   * (status=PENDING) e o histórico do motorista.
   */
  async findMany(filter: ListEarningsFilter): Promise<IEarningPublic[]> {
    try {
      const earnings = await prisma.earning.findMany({
        where: {
          ...(filter.userId ? { userId: filter.userId } : {}),
          ...(filter.status ? { status: filter.status } : {}),
          ...(filter.from || filter.to
            ? {
                date: {
                  ...(filter.from ? { gte: filter.from } : {}),
                  ...(filter.to ? { lte: filter.to } : {}),
                },
              }
            : {}),
        },
        select: this.publicSelect,
        // Pendentes primeiro por data mais antiga: quem espera há mais tempo
        // aparece no topo da fila de revisão.
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      });
      return earnings.map((e) => this.toPublic(e));
    } catch (err) {
      logger.error('Erro ao buscar ganhos com filtro', err);
      throw err;
    }
  }

  async findById(id: string): Promise<IEarningPublic | null> {
    try {
      const earning = await prisma.earning.findUnique({
        where: { id },
        select: this.publicSelect,
      });
      return earning ? this.toPublic(earning) : null;
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
      return earnings.map((e) => this.toPublic(e));
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
          status: data.status,
          notes: data.notes ?? null,
          reviewedById: data.reviewedById ?? null,
          reviewedAt: data.reviewedAt ?? null,
        },
        select: this.publicSelect,
      });
      return this.toPublic(earning);
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
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.reviewedById !== undefined ? { reviewedById: data.reviewedById } : {}),
          ...(data.reviewedAt !== undefined ? { reviewedAt: data.reviewedAt } : {}),
        },
        select: this.publicSelect,
      });
      return this.toPublic(earning);
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

  /**
   * O que o motorista comunicou num intervalo, por plataforma.
   *
   * Alimenta a conferência cruzada do fecho semanal: se o relatório da Uber
   * disser 109 € e o motorista tiver comunicado 119 €, alguém olha antes de
   * fechar a semana. Recusados ficam de fora — já foram avaliados e não batem.
   */
  async sumByPlatformInRange(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<ReportedByPlatform[]> {
    try {
      const rows = await prisma.earning.groupBy({
        by: ['platform'],
        where: {
          userId,
          date: { gte: from, lte: to },
          status: { not: EarningStatus.REJECTED },
        },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: 'desc' } },
      });

      return rows.map((r) => ({
        platform: r.platform as EarningPlatform,
        total: Number(r._sum.amount ?? 0),
        count: r._count._all,
      }));
    } catch (err) {
      logger.error('Erro ao somar ganhos comunicados', err);
      throw err;
    }
  }
}

export const earningsRepository = new EarningRepository();
