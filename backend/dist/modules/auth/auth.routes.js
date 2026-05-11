"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = authRouter;
const express_1 = require("express");
const auth_controller_1 = require("./auth.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
function authRouter() {
    const router = (0, express_1.Router)();
    router.post('/login', auth_controller_1.authController.login);
    router.post('/logout', auth_middleware_1.authMiddleware, auth_controller_1.authController.logout);
    router.get('/me', auth_middleware_1.authMiddleware, auth_controller_1.authController.me);
    return router;
}
