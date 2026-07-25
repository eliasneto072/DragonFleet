import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import { analyticsRepository, type AnalyticsStats } from './analytics.repository';

type Actor = { id: string; role?: UserRole };

/** Período padrão quando o pedido não traz datas. */
const DEFAULT_DAYS = 30;
/** Guarda contra intervalos absurdos, que forçariam varreduras longas. */
const MAX_DAYS = 366 * 3;

export class AnalyticsService {
  async getStats(
    actor: Actor,
    opts: { from?: string; to?: string } = {},
  ): Promise<AnalyticsStats> {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.MANAGER) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

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

    return analyticsRepository.getStats(from, to);
  }
}

export const analyticsService = new AnalyticsService();
