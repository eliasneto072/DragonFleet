"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRouter = analyticsRouter;
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const analytics_controller_1 = require("./analytics.controller");
function analyticsRouter() {
    const router = (0, express_1.Router)();
    router.use(auth_middleware_1.authMiddleware);
    router.get('/stats', analytics_controller_1.analyticsController.getStats);
    return router;
}
