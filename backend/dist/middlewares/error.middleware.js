"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMiddleware = void 0;
const AppError_1 = require("../shared/errors/AppError");
const logger_1 = require("../shared/utils/logger");
const errorMiddleware = (err, _req, res, _next) => {
    if (err instanceof AppError_1.AppError) {
        return res.status(err.statusCode).json({ ok: false, message: err.message, code: err.code });
    }
    logger_1.logger.error(err);
    return res.status(500).json({ ok: false, message: 'Internal server error' });
};
exports.errorMiddleware = errorMiddleware;
