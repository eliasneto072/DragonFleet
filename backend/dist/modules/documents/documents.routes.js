"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentsRouter = documentsRouter;
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const documents_controller_1 = require("./documents.controller");
const upload_middleware_1 = require("../../middlewares/upload.middleware");
function documentsRouter() {
    const router = (0, express_1.Router)();
    router.use(auth_middleware_1.authMiddleware);
    router.get('/', documents_controller_1.documentsController.list);
    router.get('/:id', documents_controller_1.documentsController.getById);
    router.post('/', upload_middleware_1.upload.single('file'), documents_controller_1.documentsController.create); // ← multipart
    router.patch('/:id', documents_controller_1.documentsController.update);
    router.patch('/:id/status', documents_controller_1.documentsController.updateStatus);
    router.delete('/:id', documents_controller_1.documentsController.remove);
    return router;
}
