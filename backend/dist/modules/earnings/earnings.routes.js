"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.earningsRouter = earningsRouter;
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const earnings_controller_1 = require("./earnings.controller");
function earningsRouter() {
    const router = (0, express_1.Router)();
    router.use(auth_middleware_1.authMiddleware);
    router.get('/', earnings_controller_1.earningsController.list);
    router.get('/user/:userId', earnings_controller_1.earningsController.listByUser);
    router.get('/:id', earnings_controller_1.earningsController.getById);
    router.post('/', earnings_controller_1.earningsController.create);
    router.patch('/:id', earnings_controller_1.earningsController.update);
    router.delete('/:id', earnings_controller_1.earningsController.remove);
    return router;
}
