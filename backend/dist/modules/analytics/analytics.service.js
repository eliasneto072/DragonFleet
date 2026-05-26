"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsService = exports.AnalyticsService = void 0;
const AppError_1 = require("../../shared/errors/AppError");
const enums_1 = require("../../shared/types/enums");
const analytics_repository_1 = require("./analytics.repository");
class AnalyticsService {
    async getStats(actor) {
        if (actor.role !== enums_1.UserRole.ADMIN && actor.role !== enums_1.UserRole.MANAGER) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        return analytics_repository_1.analyticsRepository.getStats();
    }
}
exports.AnalyticsService = AnalyticsService;
exports.analyticsService = new AnalyticsService();