"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentsRouter = documentsRouter;
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const documents_controller_1 = require("./documents.controller");
function documentsRouter() {
    const router = (0, express_1.Router)();
    router.use(auth_middleware_1.authMiddleware);
    router.get('/', auth_middleware_1.authMiddleware, documents_controller_1.documentsController.list);
    router.get('/:id', auth_middleware_1.authMiddleware, documents_controller_1.documentsController.getById);
    router.post('/', auth_middleware_1.authMiddleware, documents_controller_1.documentsController.create);
    router.patch('/:id', auth_middleware_1.authMiddleware, documents_controller_1.documentsController.update);
    // rota específica para status (mais seguro e claro)
    router.patch('/:id/status', auth_middleware_1.authMiddleware, documents_controller_1.documentsController.updateStatus);
    router.delete('/:id', auth_middleware_1.authMiddleware, documents_controller_1.documentsController.remove);
    return router;
}
