"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const AppError_1 = require("../shared/errors/AppError");
const ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
];
const MAX_SIZE_MB = 10;
exports.upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: MAX_SIZE_MB * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_TYPES.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new AppError_1.AppError('Formato inválido. Envie uma imagem JPEG, PNG, WebP ou PDF.', 400, 'INVALID_FILE_TYPE'));
        }
    },
});
