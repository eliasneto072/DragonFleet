"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalsRouter = withdrawalsRouter;
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const withdrawals_controller_1 = require("./withdrawals.controller");
function withdrawalsRouter() {
    const router = (0, express_1.Router)();
    router.use(auth_middleware_1.authMiddleware);
    router.get('/', withdrawals_controller_1.withdrawalsController.list);
    router.get('/user/:userId', withdrawals_controller_1.withdrawalsController.listByUser);
    router.get('/:id', withdrawals_controller_1.withdrawalsController.getById);
    router.post('/', withdrawals_controller_1.withdrawalsController.create);
    router.patch('/:id/status', withdrawals_controller_1.withdrawalsController.updateStatus);
    router.delete('/:id', withdrawals_controller_1.withdrawalsController.remove);
    return router;
}
