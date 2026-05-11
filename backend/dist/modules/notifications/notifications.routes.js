"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsRouter = notificationsRouter;
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const notifications_controller_1 = require("./notifications.controller");
function notificationsRouter() {
    const router = (0, express_1.Router)();
    router.use(auth_middleware_1.authMiddleware);
    router.get('/', notifications_controller_1.notificationsController.list);
    router.get('/user/:userId', notifications_controller_1.notificationsController.listByUser);
    router.get('/:id', notifications_controller_1.notificationsController.getById);
    router.post('/', notifications_controller_1.notificationsController.create);
    router.patch('/:id', notifications_controller_1.notificationsController.update);
    router.delete('/:id', notifications_controller_1.notificationsController.remove);
    return router;
}
