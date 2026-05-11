"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = usersRouter;
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const users_controller_1 = require("./users.controller");
function usersRouter() {
    const router = (0, express_1.Router)();
    router.get('/', auth_middleware_1.authMiddleware, users_controller_1.usersController.list);
    router.get('/:id', auth_middleware_1.authMiddleware, users_controller_1.usersController.getById);
    router.post('/', users_controller_1.usersController.create);
    router.patch('/:id', auth_middleware_1.authMiddleware, users_controller_1.usersController.update);
    router.delete('/:id', auth_middleware_1.authMiddleware, users_controller_1.usersController.remove);
    return router;
}
