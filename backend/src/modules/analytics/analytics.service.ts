import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import { analyticsRepository } from './analytics.repository';

type Actor = { id: string; role?: UserRole };

export class AnalyticsService {
  async getStats(actor: Actor) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.MANAGER) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    return analyticsRepository.getStats();
  }
}

export const analyticsService = new AnalyticsService();