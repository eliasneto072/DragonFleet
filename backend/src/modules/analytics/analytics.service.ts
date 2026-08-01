import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import { settingsService } from '../settings/settings.service';
import {
  analyticsRepository,
  type AnalyticsStats,
  type StalledDriver,
} from './analytics.repository';

type Actor = { id: string; role?: UserRole };

/** Período padrão das análises quando o pedido não traz datas. */
const DEFAULT_DAYS = 30;
/** Guarda contra intervalos absurdos, que forçariam varreduras longas. */
const MAX_DAYS = 366 * 3;
/** Dias sem lançamentos a partir dos quais um motorista conta como parado. */
const STALLED_AFTER_DAYS = 14;

/** Segunda-feira da semana anterior à de `ref`, em UTC. */
function lastWeekRange(ref: Date): { start: Date; end: Date } {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const weekday = (d.getUTCDay() + 6) % 7; // 0 = segunda
  d.setUTCDate(d.getUTCDate() - weekday - 7);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: d, end };
}

export interface AnalyticsStatsResponse extends AnalyticsStats {
  /**
   * Comissão vigente, em fração (0.15 = 15%).
   *
   * Vai na resposta de propósito: o frontend tinha 0.20 cravado em
   * shared/constants enquanto SystemSettings guardava 15, e a receita da
   * empresa aparecia um terço acima do real. Com o valor a viajar junto dos
   * números que ele multiplica, não há como divergirem.
   */
  companyCommission: number;
}

export interface AnalyticsOverview {
  queue: {
    documentsPending: { count: number; oldestAt: string | null };
    withdrawalsPending: { count: number; total: number; oldestAt: string | null };
    /** Lançamentos comunicados à espera de confirmação. */
    earningsPending: { count: number; oldestAt: string | null };
    driversBlocked: number;
    documentsExpiringSoon: { count: number; days: number };
    /** Motoristas ativos sem fecho da semana passada. */
    missingSettlements: {
      count: number;
      /** Primeiros nomes, para a linha do painel. */
      drivers: { id: string; name: string }[];
      weekStart: string;
      weekEnd: string;
    };
  };
  finance: {
    companyCommission: number;
    revenueThisMonth: number;
    revenuePrevMonth: number;
    grossThisMonth: number;
    /** Passivo: soma apenas dos saldos positivos. */
    owedToDrivers: number;
    /** Valor a receber: soma dos saldos negativos, em valor absoluto. */
    owedByDrivers: number;
    paidThisMonth: number;
    paidCountThisMonth: number;
  };
  drivers: {
    total: number;
    activeLast30: number;
    stalledAfterDays: number;
    stalled: StalledDriver[];
  };
}

function ensureManager(actor: Actor) {
  if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.MANAGER) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
}

/** SystemSettings guarda a comissão em pontos percentuais (15 = 15%). */
async function commissionFraction(): Promise<number> {
  const settings = await settingsService.get();
  return Number(settings.companyCommission ?? 0) / 100;
}

export class AnalyticsService {
  async getStats(
    actor: Actor,
    opts: { from?: string; to?: string } = {},
  ): Promise<AnalyticsStatsResponse> {
    ensureManager(actor);

    const to = opts.to ? new Date(opts.to) : new Date();
    const from = opts.from
      ? new Date(opts.from)
      : new Date(to.getFullYear(), to.getMonth(), to.getDate() - (DEFAULT_DAYS - 1));

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new AppError('Intervalo de datas inválido', 400, 'INVALID_RANGE');
    }
    if (from > to) {
      throw new AppError('Data inicial posterior à final', 400, 'INVALID_RANGE');
    }

    const days = (to.getTime() - from.getTime()) / 86_400_000;
    if (days > MAX_DAYS) {
      throw new AppError('Intervalo demasiado longo', 400, 'RANGE_TOO_LONG');
    }

    // As datas chegam como dia puro; estender ao fim do dia final evita
    // perder os lançamentos da própria data limite.
    to.setHours(23, 59, 59, 999);
    from.setHours(0, 0, 0, 0);

    const [stats, companyCommission] = await Promise.all([
      analyticsRepository.getStats(from, to),
      commissionFraction(),
    ]);

    return { ...stats, companyCommission };
  }

  /**
   * Painel: o que precisa de ação agora. Endpoint separado do getStats de
   * propósito — são dois consumidores com necessidades diferentes, e juntá-los
   * faria o painel puxar séries mensais que não usa e as análises puxarem
   * filas de trabalho que não mostram.
   */
  async getOverview(actor: Actor): Promise<AnalyticsOverview> {
    ensureManager(actor);

    const settings = await settingsService.get();
    const commission = Number(settings.companyCommission ?? 0) / 100;
    const warningDays = Number(settings.documentExpiryWarningDays ?? 7);

    const now = new Date();
    const stalledSince = new Date(now);
    stalledSince.setDate(stalledSince.getDate() - STALLED_AFTER_DAYS);

    const expiringUntil = new Date(now);
    expiringUntil.setDate(expiringUntil.getDate() + warningDays);

    const lastWeek = lastWeekRange(now);

    const raw = await analyticsRepository.getOverview(stalledSince, expiringUntil, lastWeek);

    return {
      queue: {
        documentsPending: {
          count: raw.documentsPending.count,
          oldestAt: raw.documentsPending.oldestAt?.toISOString() ?? null,
        },
        withdrawalsPending: {
          count: raw.withdrawalsPending.count,
          total: raw.withdrawalsPending.total,
          oldestAt: raw.withdrawalsPending.oldestAt?.toISOString() ?? null,
        },
        earningsPending: {
          count: raw.earningsPending.count,
          oldestAt: raw.earningsPending.oldestAt?.toISOString() ?? null,
        },
        driversBlocked: raw.driversBlocked,
        documentsExpiringSoon: {
          count: raw.documentsExpiringSoon,
          days: warningDays,
        },
        missingSettlements: {
          count: raw.missingSettlements.length,
          // Só os primeiros: a linha do painel mostra nomes, não uma lista.
          drivers: raw.missingSettlements.slice(0, 4),
          weekStart: lastWeek.start.toISOString().slice(0, 10),
          weekEnd: lastWeek.end.toISOString().slice(0, 10),
        },
      },
      finance: {
        companyCommission: commission,
        revenueThisMonth: Math.round(raw.grossThisMonth * commission * 100) / 100,
        revenuePrevMonth: Math.round(raw.grossPrevMonth * commission * 100) / 100,
        grossThisMonth: raw.grossThisMonth,
        owedToDrivers: raw.owedToDrivers,
        owedByDrivers: raw.owedByDrivers,
        paidThisMonth: raw.paidThisMonth,
        paidCountThisMonth: raw.paidCountThisMonth,
      },
      drivers: {
        total: raw.totalDrivers,
        activeLast30: raw.activeLast30,
        stalledAfterDays: STALLED_AFTER_DAYS,
        stalled: raw.stalledDrivers,
      },
    };
  }
}

export const analyticsService = new AnalyticsService();
