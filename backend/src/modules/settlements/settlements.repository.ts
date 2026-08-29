// src/modules/settlements/settlements.repository.ts

import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { SettlementStatus } from '../../shared/types/enums';
import type { SettlementPublic } from './settlements.types';
import { buildPageInfo, type PageParams, type Paged } from '../../shared/http/pagination';

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

    // Nulo nos fechos anteriores ao imposto. A conversão tem de passar pelo
    // teste explícito: Number(null) é 0, e isso apagaria a distinção entre
    // "não teve imposto" e "taxa posta a zero".
    taxRate: r.taxRate === null || r.taxRate === undefined ? null : Number(r.taxRate),
    taxBase: r.taxBase === null || r.taxBase === undefined ? 0 : Number(r.taxBase),
    taxAmount: r.taxAmount === null || r.taxAmount === undefined ? 0 : Number(r.taxAmount),

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

  /**
   * Uma página de fechos, mais os totais do filtro INTEIRO.
   *
   * ─── POR QUE OS TOTAIS VÊM DAQUI ───────────────────────────────────────────
   *
   * A tela mostrava "31 390 409,71 € creditados em 88207 fechos" e chegava lá
   * somando os 88 mil objetos no browser. Era essa soma que obrigava a mandar
   * tudo — e o Postgres faz a mesma conta em 32 milissegundos.
   *
   * Por isso os totais NÃO são da página: são de tudo o que o filtro apanha.
   * Sem isso, paginar teria partido o cartão do topo, que passaria a dizer o
   * total dos cinquenta visíveis em vez do total real.
   */
  async findManyPaged(filter: {
    userId?: string;
    status?: SettlementStatus;
    from?: Date;
    to?: Date;
  }, page: PageParams, includeInternal = false): Promise<
    Paged<SettlementPublic> & { totals: { credited: number; registeredCount: number } }
  > {
    const where = {
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
    };

    const [rows, total, somas] = await Promise.all([
      prisma.weeklySettlement.findMany({
        where,
        orderBy: [{ weekStart: 'desc' }, { createdAt: 'desc' }],
        include,
        skip: page.skip,
        take: page.pageSize,
      }),

      prisma.weeklySettlement.count({ where }),

      // Só os REGISTADOS entram no creditado: um rascunho aparece na lista mas
      // ainda não é dinheiro. O cartão do topo dizia "creditados", e contar
      // rascunhos aí seria prometer o que não foi pago.
      prisma.weeklySettlement.aggregate({
        where: { ...where, status: SettlementStatus.REGISTERED },
        _sum: { netToDriver: true },
        _count: { _all: true },
      }),
    ]);

    return {
      items: rows.map((r) => toPublic(r as Row, includeInternal)),
      page: buildPageInfo(page, total),
      totals: {
        credited: Number(somas._sum.netToDriver ?? 0),
        registeredCount: somas._count._all,
      },
    };
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
