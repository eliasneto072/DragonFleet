"use strict";
// ============================
// modules/upload/upload.routes.ts
// ============================
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRoutes = void 0;
const express_1 = require("express");
const upload_controller_1 = require("./upload.controller");
const upload_middleware_1 = require("../../middlewares/upload.middleware");
const uploadRoutes = (0, express_1.Router)();
exports.uploadRoutes = uploadRoutes;
const uploadController = new upload_controller_1.UploadController();
// POST /upload
uploadRoutes.post('/', upload_middleware_1.upload.single('image'), uploadController.upload);