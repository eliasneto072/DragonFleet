// src/modules/ranks/ranks.service.ts
//
// Ranks: calcular, guardar e explicar.
//
// As regras estão em `ranks.math.ts` (puras, testadas à parte). Aqui vai-se
// buscar as métricas à base, compara-se com as metas, e escreve-se o resultado.
//
// ─── PORQUE SE GUARDA O RANK E NÃO SE CALCULA SEMPRE ────────────────────────
//
// Podia calcular-se a cada leitura, mas então ninguém saberia QUANDO alguém
// subiu ou desceu — e sem isso não há notificação nem histórico, e o motorista
// que perde um desconto não tem a quem perguntar porquê. A linha guardada é
// também o que permite a proteção de 30 dias: é preciso lembrar com que rank
// ele acabou a temporada.
//
// O cálculo corre todas as noites para toda a gente, e também quando o próprio
// motorista abre a tela — assim, quem acabou de atingir a meta vê a subida na
// hora, sem esperar pela madrugada.

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';
import { UserRole } from '../../shared/types/enums';
import {
  TIERS, dateToDay, dayToDate, earnedTier, effectiveTier, floorActive, floorUntilFor,
  lisbonDay, progressTo, seasonOf, tierIndex, type Day, type DriverMetrics, type Season,
  type Tier, type TierRequirements,
} from './ranks.math';

type Actor = { id: string; role?: UserRole };

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));

const fmtDay = (d: Day) => d.split('-').reverse().join('/');

function isAdmin(role?: UserRole) {
  return role === UserRole.ADMIN;
}

function podeVer(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.SUPPORT;
}

// ─── Formas públicas ────────────────────────────────────────────────────────

export interface RankConfigPublic extends TierRequirements {
  label: string;
  color: string;
  fuelDiscount: number;
  vehicleDiscount: number;
  tollsDiscount: number;
  investmentRateBonus: number;
  perks: string | null;
}

export interface RankStatus {
  userId: string;
  userName?: string;
  /** O que vale hoje. */
  tier: Tier;
  /** O que as metas dão neste momento. */
  earnedTier: Tier;
  /** Mínimo garantido e até quando, quando a proteção está a valer. */
  floorTier: Tier | null;
  floorUntil: Day | null;
  floorDaysLeft: number;
  season: Season;
  metrics: DriverMetrics;
  /** O nível seguinte e o que falta para lá chegar. Nulo no topo. */
  next: {
    tier: Tier;
    ratio: number;
    missing: ReturnType<typeof progressTo>['missing'];
  } | null;
}

// ─── Configuração ───────────────────────────────────────────────────────────

function toConfigPublic(row: {
  tier: Tier; label: string; color: string;
  minSeasonRevenue: Prisma.Decimal; minInvested: Prisma.Decimal; minBalance: Prisma.Decimal;
  minWeeks: number; requireValidDocuments: boolean;
  fuelDiscount: Prisma.Decimal; vehicleDiscount: Prisma.Decimal; tollsDiscount: Prisma.Decimal;
  investmentRateBonus: Prisma.Decimal; perks: string | null;
}): RankConfigPublic {
  return {
    tier: row.tier,
    label: row.label,
    color: row.color,
    minSeasonRevenue: num(row.minSeasonRevenue),
    minInvested: num(row.minInvested),
    minBalance: num(row.minBalance),
    minWeeks: row.minWeeks,
    requireValidDocuments: row.requireValidDocuments,
    fuelDiscount: num(row.fuelDiscount),
    vehicleDiscount: num(row.vehicleDiscount),
    tollsDiscount: num(row.tollsDiscount),
    investmentRateBonus: num(row.investmentRateBonus),
    perks: row.perks,
  };
}

async function loadConfigs(): Promise<RankConfigPublic[]> {
  const rows = await prisma.rankConfig.findMany();
  const byTier = new Map(rows.map((r) => [r.tier as Tier, r]));
  // Pela ordem dos níveis, e não pela ordem que a base devolver: a escada tem
  // de sair sempre do mais baixo para o mais alto.
  return TIERS.map((t) => {
    const row = byTier.get(t);
    if (!row) {
      // A migração cria as cinco linhas. Se faltar uma, um nível sem metas é
      // melhor do que rebentar a tela toda.
      return {
        tier: t, label: t, color: '#64748B',
        minSeasonRevenue: 0, minInvested: 0, minBalance: 0, minWeeks: 0,
        requireValidDocuments: false,
        fuelDiscount: 0, vehicleDiscount: 0, tollsDiscount: 0, investmentRateBonus: 0, perks: null,
      };
    }
    return toConfigPublic(row as never);
  });
}

// ─── Métricas ───────────────────────────────────────────────────────────────

/**
 * As quatro métricas de um motorista, numa consulta.
 *
 * A faturação é o BRUTO dos fechos registados dentro da temporada — o que ele
 * fez nas plataformas, não o que lhe sobrou. O saldo e o investido vêm da view
 * `driver_balances`, a mesma que o portal mostra, para o rank não poder
 * discordar do saldo que ele vê.
 */
async function readMetrics(userId: string, season: Season): Promise<DriverMetrics> {
  const [fechos, saldo, docs] = await Promise.all([
    prisma.$queryRaw<{ revenue: number; weeks: number }[]>`
      SELECT
        CAST(COALESCE(SUM(gross_revenue), 0) AS FLOAT) AS revenue,
        COUNT(*)::int AS weeks
      FROM weekly_settlements
      WHERE user_id = ${userId}
        AND status = 'REGISTERED'
        AND week_start >= ${dayToDate(season.start)}::date
        AND week_start <= ${dayToDate(season.end)}::date
    `,
    prisma.$queryRaw<{ available: number; invested_active: number }[]>`
      SELECT CAST(available AS FLOAT) AS available,
             CAST(invested_active AS FLOAT) AS invested_active
      FROM driver_balances WHERE user_id = ${userId}
    `,
    prisma.document.count({ where: { userId, status: 'EXPIRED' } }),
  ]);

  return {
    seasonRevenue: Math.round(Number(fechos[0]?.revenue ?? 0) * 100) / 100,
    weeks: Number(fechos[0]?.weeks ?? 0),
    balance: Math.round(Number(saldo[0]?.available ?? 0) * 100) / 100,
    invested: Math.round(Number(saldo[0]?.invested_active ?? 0) * 100) / 100,
    documentsOk: docs === 0,
  };
}

// ─── O cálculo ──────────────────────────────────────────────────────────────

export class RanksService {
  async listConfigs(_actor: Actor): Promise<RankConfigPublic[]> {
    // Qualquer utilizador autenticado lê a escada: o motorista precisa dela
    // para saber o que lhe falta.
    return loadConfigs();
  }

  async updateConfig(actor: Actor, tier: Tier, input: Partial<Omit<RankConfigPublic, 'tier'>>) {
    if (!isAdmin(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const data: Prisma.RankConfigUpdateInput = {
      ...(input.label !== undefined ? { label: input.label.trim() } : {}),
      ...(input.color !== undefined ? { color: input.color.trim() } : {}),
      ...(input.minSeasonRevenue !== undefined ? { minSeasonRevenue: input.minSeasonRevenue } : {}),
      ...(input.minInvested !== undefined ? { minInvested: input.minInvested } : {}),
      ...(input.minBalance !== undefined ? { minBalance: input.minBalance } : {}),
      ...(input.minWeeks !== undefined ? { minWeeks: input.minWeeks } : {}),
      ...(input.requireValidDocuments !== undefined
        ? { requireValidDocuments: input.requireValidDocuments } : {}),
      ...(input.fuelDiscount !== undefined ? { fuelDiscount: input.fuelDiscount } : {}),
      ...(input.vehicleDiscount !== undefined ? { vehicleDiscount: input.vehicleDiscount } : {}),
      ...(input.tollsDiscount !== undefined ? { tollsDiscount: input.tollsDiscount } : {}),
      ...(input.investmentRateBonus !== undefined
        ? { investmentRateBonus: input.investmentRateBonus } : {}),
      ...(input.perks !== undefined ? { perks: input.perks?.trim() || null } : {}),
    };

    const updated = await prisma.rankConfig.update({ where: { tier }, data });
    logger.info(`[ranks] ${actor.id} alterou o nível ${tier}`);
    return toConfigPublic(updated as never);
  }

  /**
   * Recalcula o rank de um motorista e devolve o estado.
   *
   * Faz três coisas por esta ordem, e a ordem importa:
   *   1. se a temporada mudou desde o último cálculo, fecha a anterior e
   *      guarda o rank alcançado como mínimo garantido por 30 dias;
   *   2. lê as métricas da temporada atual e calcula o rank conquistado;
   *   3. aplica a proteção e, se o rank efetivo mudou, regista e notifica.
   */
  async recompute(userId: string, now: Date = new Date()): Promise<RankStatus> {
    const today = lisbonDay(now);
    const season = seasonOf(today);
    const configs = await loadConfigs();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

    const atual = await prisma.driverRank.findUnique({ where: { userId } });

    let floorTier: Tier | null = (atual?.floorTier as Tier | null) ?? null;
    let floorUntil: Day | null = atual?.floorUntil ? dateToDay(atual.floorUntil) : null;
    const anterior: Tier = (atual?.tier as Tier | undefined) ?? 'TIER_1';
    const eventos: { kind: 'UP' | 'DOWN' | 'SEASON_END' | 'FLOOR_EXPIRED'; tier: Tier; from?: Tier; note: string }[] = [];

    // 1. Fim de temporada.
    if (atual && dateToDay(atual.seasonStart) < season.start) {
      const terminada = seasonOf(dateToDay(atual.seasonStart));
      floorTier = anterior;
      floorUntil = floorUntilFor(terminada);
      eventos.push({
        kind: 'SEASON_END',
        tier: anterior,
        note: `Temporada de ${fmtDay(terminada.start)} a ${fmtDay(terminada.end)} terminada. `
          + `Nível garantido até ${fmtDay(floorUntil)}.`,
      });
    }

    // 2. As métricas da temporada atual.
    const metrics = await readMetrics(userId, season);
    const earned = earnedTier(metrics, configs);

    // 3. A proteção.
    if (floorUntil && !floorActive(floorUntil, today)) {
      if (floorTier && tierIndex(floorTier) > tierIndex(earned)) {
        eventos.push({
          kind: 'FLOOR_EXPIRED',
          tier: earned,
          from: floorTier,
          note: 'Acabaram os 30 dias de proteção do nível da temporada anterior.',
        });
      }
      floorTier = null;
      floorUntil = null;
    }

    const tier = effectiveTier({ earned, floorTier, floorUntil, today });

    if (tier !== anterior && atual) {
      eventos.push({
        kind: tierIndex(tier) > tierIndex(anterior) ? 'UP' : 'DOWN',
        tier,
        from: anterior,
        note: tierIndex(tier) > tierIndex(anterior) ? 'Metas atingidas.' : 'Metas deixaram de ser cumpridas.',
      });
    }

    const dados = {
      tier,
      earnedTier: earned,
      floorTier,
      floorUntil: floorUntil ? dayToDate(floorUntil) : null,
      seasonStart: dayToDate(season.start),
      seasonRevenue: metrics.seasonRevenue,
      invested: metrics.invested,
      balance: metrics.balance,
      weeks: metrics.weeks,
      documentsOk: metrics.documentsOk,
    };

    await prisma.driverRank.upsert({
      where: { userId },
      create: { userId, ...dados },
      update: dados,
    });

    // Notificar e registar. Um utilizador novo não recebe "subiu de nível" só
    // por o rank ter nascido: `atual` inexistente não gera evento de subida.
    for (const e of eventos) {
      await prisma.rankEvent.create({
        data: { userId, kind: e.kind, tier: e.tier, fromTier: e.from ?? null, note: e.note },
      });
    }

    const nomes = new Map(configs.map((c) => [c.tier, c.label]));
    const subiu = eventos.find((e) => e.kind === 'UP');
    const desceu = eventos.find((e) => e.kind === 'DOWN');
    if (subiu || desceu) {
      const e = subiu ?? desceu!;
      try {
        await prisma.notification.create({
          data: {
            userId,
            title: subiu ? `Subiu para ${nomes.get(e.tier)}` : `Passou para ${nomes.get(e.tier)}`,
            message: subiu
              ? `Parabéns! As vantagens de ${nomes.get(e.tier)} já estão ativas.`
              : floorActive(floorUntil, today) && floorTier
                ? `As vantagens de ${nomes.get(floorTier)} continuam garantidas até ${fmtDay(floorUntil!)}.`
                : `As metas do nível anterior deixaram de estar cumpridas.`,
          },
        });
      } catch (err) {
        logger.error('[ranks] Erro ao notificar mudança de nível', err);
      }
    }

    return this.toStatus(user.name, userId, {
      tier, earned, floorTier, floorUntil, season, metrics, today, configs,
    });
  }

  private toStatus(userName: string, userId: string, a: {
    tier: Tier; earned: Tier; floorTier: Tier | null; floorUntil: Day | null;
    season: Season; metrics: DriverMetrics; today: Day; configs: RankConfigPublic[];
  }): RankStatus {
    const proximo = a.configs.find((c) => tierIndex(c.tier) === tierIndex(a.earned) + 1);
    const p = proximo ? progressTo(a.metrics, proximo) : null;

    return {
      userId,
      userName,
      tier: a.tier,
      earnedTier: a.earned,
      floorTier: a.floorTier,
      floorUntil: a.floorUntil,
      floorDaysLeft: a.floorUntil
        ? Math.max(0, Math.round(
            (Date.parse(`${a.floorUntil}T00:00:00Z`) - Date.parse(`${a.today}T00:00:00Z`)) / 86_400_000,
          ))
        : 0,
      season: a.season,
      metrics: a.metrics,
      next: proximo && p ? { tier: proximo.tier, ratio: p.ratio, missing: p.missing } : null,
    };
  }

  /** O estado de um motorista, recalculado na hora. */
  async statusFor(actor: Actor, userId: string): Promise<RankStatus> {
    if (!podeVer(actor.role) && actor.id !== userId) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    return this.recompute(userId);
  }

  /** O nível que vale hoje para um utilizador, sem recalcular. Usado pelos
   *  investimentos para saber se ele pode entrar num plano. */
  async currentTier(userId: string): Promise<Tier> {
    const row = await prisma.driverRank.findUnique({ where: { userId }, select: { tier: true } });
    return (row?.tier as Tier | undefined) ?? 'TIER_1';
  }

  async events(actor: Actor, userId: string) {
    if (!podeVer(actor.role) && actor.id !== userId) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    const rows = await prisma.rankEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      tier: r.tier as Tier,
      fromTier: (r.fromTier as Tier | null) ?? null,
      note: r.note,
      createdAt: r.createdAt,
    }));
  }

  /** A vista da administração: quantos em cada nível e a lista. */
  async overview(actor: Actor, filter: { tier?: Tier; search?: string } = {}) {
    if (!podeVer(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const rows = await prisma.driverRank.findMany({
      where: {
        ...(filter.tier ? { tier: filter.tier } : {}),
        user: {
          role: UserRole.DRIVER,
          ...(filter.search?.trim()
            ? { name: { contains: filter.search.trim(), mode: 'insensitive' as const } }
            : {}),
        },
      },
      include: { user: { select: { name: true, email: true, status: true } } },
      orderBy: [{ tier: 'desc' }, { seasonRevenue: 'desc' }],
      take: 500,
    });

    const counts = await prisma.driverRank.groupBy({
      by: ['tier'],
      where: { user: { role: UserRole.DRIVER } },
      _count: { _all: true },
    });

    return {
      drivers: rows.map((r) => ({
        userId: r.userId,
        name: r.user.name,
        email: r.user.email,
        status: r.user.status,
        tier: r.tier as Tier,
        earnedTier: r.earnedTier as Tier,
        floorTier: (r.floorTier as Tier | null) ?? null,
        floorUntil: r.floorUntil ? dateToDay(r.floorUntil) : null,
        seasonRevenue: num(r.seasonRevenue),
        invested: num(r.invested),
        balance: num(r.balance),
        weeks: r.weeks,
        documentsOk: r.documentsOk,
        updatedAt: r.updatedAt,
      })),
      counts: TIERS.map((t) => ({
        tier: t,
        count: counts.find((c) => c.tier === t)?._count._all ?? 0,
      })),
      season: seasonOf(lisbonDay()),
    };
  }

  /**
   * Recalcula toda a gente. Corre todas as noites.
   *
   * Um motorista de cada vez, e uma falha não trava os outros: é melhor
   * atualizar 199 e registar o erro de um do que deixar toda a frota parada.
   */
  async runDaily(now: Date = new Date()): Promise<{ processed: number; failed: number }> {
    const motoristas = await prisma.user.findMany({
      where: { role: UserRole.DRIVER },
      select: { id: true },
    });

    let processed = 0;
    let failed = 0;
    for (const m of motoristas) {
      try {
        await this.recompute(m.id, now);
        processed++;
      } catch (err) {
        failed++;
        logger.error(`[ranks] Falhou o cálculo do nível de ${m.id}`, err);
      }
    }
    logger.info(`[ranks] Níveis recalculados: ${processed} motoristas, ${failed} falhas.`);
    return { processed, failed };
  }
}

export const ranksService = new RanksService();
