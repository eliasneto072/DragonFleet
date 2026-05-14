"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vehiclesRouter = vehiclesRouter;
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const vehicles_controller_1 = require("./vehicles.controller");
function vehiclesRouter() {
    const router = (0, express_1.Router)();
    router.use(auth_middleware_1.authMiddleware); // todas as rotas de vehicles exigem autenticação
    router.get('/', vehicles_controller_1.vehiclesController.list);
    router.get('/user/:userId', vehicles_controller_1.vehiclesController.listByUser); // antes de /:id
    router.get('/:id', vehicles_controller_1.vehiclesController.getById);
    router.post('/', vehicles_controller_1.vehiclesController.create);
    router.patch('/:id', vehicles_controller_1.vehiclesController.update);
    router.delete('/:id', vehicles_controller_1.vehiclesController.remove);
    return router;
}
