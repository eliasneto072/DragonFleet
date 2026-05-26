"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsController = exports.AnalyticsController = void 0;
const response_1 = require("../../shared/http/response");
const AppError_1 = require("../../shared/errors/AppError");
const analytics_service_1 = require("./analytics.service");
function getActor(req) {
    if (!req.user?.id)
        throw new AppError_1.AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
    return { id: req.user.id, role: req.user.role };
}
class AnalyticsController {
    constructor() {
        this.getStats = async (req, res) => {
            const stats = await analytics_service_1.analyticsService.getStats(getActor(req));
            return (0, response_1.ok)(res, { stats });
        };
    }
}
exports.AnalyticsController = AnalyticsController;
exports.analyticsController = new AnalyticsController();