// src/modules/settlements/settlements.repository.ts

import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { SettlementStatus } from '../../shared/types/enums';
import type { SettlementPublic } from './settlements.types';

const include = {
  user: { select: { name: true } },
  createdBy: { select: { name: true } },
  vehicle: { select: { plate: true } },
} as const;

type Row = NonNullable<Awaited<ReturnType<typeof prisma.weeklySettlement.findFirst>>> & {
  user?: { name: string } | null;
  createdBy?: { name: string } | null;
  vehicle?: { plate: string } | null;
};

/**
 * Converte a linha para o formato público.
 *
 * `includeInternal` decide se as observações internas seguem na resposta. O
 * filtro é aqui, e não na interface: uma tela que se esqueça de esconder o
 * campo expõe o que devia ser reservado, enquanto um campo que nunca sai da
 * base não pode ser exposto por descuido de quem escreve a próxima tela.
 */
function toPublic(r: Row, includeInternal = false): SettlementPublic {
  const grossRevenue = Number(r.grossRevenue);
  const totalDeductions = Number(r.totalDeductions);
  const commissionAmount = Number(r.commissionAmount);

  return {
    id: r.id,
    userId: r.userId,
    userName: r.user?.name ?? '',
    vehicleId: r.vehicleId,
    vehiclePlate: r.vehicle?.plate ?? null,
    weekStart: r.weekStart,
    weekEnd: r.weekEnd,

    uberAmount: Number(r.uberAmount),
    boltAmount: Number(r.boltAmount),
    otherRevenue: Number(r.otherRevenue),

    tollsAmount: Number(r.tollsAmount),
    fuelAmount: Number(r.fuelAmount),
    vehicleFee: Number(r.vehicleFee),
    otherDeductions: Number(r.otherDeductions),

    commissionRate: Number(r.commissionRate),

    grossRevenue,
    // operatingCosts não tem coluna própria: é o total de deduções menos a
    // comissão. Guardar os dois seria informação redundante a poder divergir.
    operatingCosts: Math.round((totalDeductions - commissionAmount) * 100) / 100,
    profitBase: Number(r.profitBase),
    commissionAmount,
    totalDeductions,
    netToDriver: Number(r.netToDriver),

    status: r.status as SettlementStatus,
    notes: r.notes,
    ...(includeInternal ? { internalNotes: r.internalNotes } : {}),

    createdById: r.createdById,
    createdByName: r.createdBy?.name ?? null,
    registeredAt: r.registeredAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export const settlementsRepository = {
  async findById(id: string, includeInternal = false): Promise<SettlementPublic | null> {
    const row = await prisma.weeklySettlement.findUnique({ where: { id }, include });
    return row ? toPublic(row as Row, includeInternal) : null;
  },

  async findMany(filter: {
    userId?: string;
    status?: SettlementStatus;
    from?: Date;
    to?: Date;
  }, includeInternal = false): Promise<SettlementPublic[]> {
    const rows = await prisma.weeklySettlement.findMany({
      where: {
        ...(filter.userId ? { userId: filter.userId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.from || filter.to
          ? {
              weekStart: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lte: filter.to } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ weekStart: 'desc' }, { createdAt: 'desc' }],
      include,
    });
    return rows.map((r) => toPublic(r as Row, includeInternal));
  },

  /**
   * Procura um fecho que se sobreponha ao intervalo indicado.
   *
   * A restrição @@unique([userId, weekStart]) do schema só apanha semanas com
   * exatamente a mesma data de início. Se alguém registar 06/07 a 12/07 e
   * depois 08/07 a 14/07, a base aceita as duas e três dias são creditados
   * duas vezes. Esta verificação é a que impede isso de facto.
   *
   * Cancelados não contam: a semana volta a ficar livre.
   */
  async findOverlapping(
    userId: string,
    weekStart: Date,
    weekEnd: Date,
    excludeId?: string,
  ): Promise<SettlementPublic | null> {
    const row = await prisma.weeklySettlement.findFirst({
      where: {
        userId,
        status: { not: SettlementStatus.CANCELLED },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        weekStart: { lte: weekEnd },
        weekEnd: { gte: weekStart },
      },
      include,
    });
    return row ? toPublic(row as Row) : null;
  },

  async create(data: Record<string, unknown>): Promise<SettlementPublic> {
    try {
      const row = await prisma.weeklySettlement.create({ data: data as never, include });
      return toPublic(row as Row, true);
    } catch (err) {
      logger.error('Erro ao criar fecho semanal', err);
      throw err;
    }
  },

  async update(id: string, data: Record<string, unknown>): Promise<SettlementPublic> {
    try {
      const row = await prisma.weeklySettlement.update({
        where: { id },
        data: data as never,
        include,
      });
      return toPublic(row as Row, true);
    } catch (err) {
      logger.error('Erro ao atualizar fecho semanal', err);
      throw err;
    }
  },

  async delete(id: string): Promise<void> {
    await prisma.weeklySettlement.delete({ where: { id } });
  },

  /** Soma dos fechos registados de um motorista — entra no cálculo do saldo. */
  async sumRegisteredNet(userId: string): Promise<number> {
    const agg = await prisma.weeklySettlement.aggregate({
      where: { userId, status: SettlementStatus.REGISTERED },
      _sum: { netToDriver: true },
    });
    return Number(agg._sum.netToDriver ?? 0);
  },
};
