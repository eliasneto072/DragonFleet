"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            ok: false,
            message: 'Missing Bearer token',
        });
    }
    const token = authHeader.slice('Bearer '.length);
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
        const userId = payload.sub;
        if (!userId) {
            return res.status(401).json({
                ok: false,
                message: 'Invalid token payload',
            });
        }
        req.user = {
            id: String(userId),
            role: payload.role,
        };
        return next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return res.status(401).json({
                ok: false,
                message: 'Token expired',
            });
        }
        return res.status(401).json({
            ok: false,
            message: 'Invalid token',
        });
    }
}
