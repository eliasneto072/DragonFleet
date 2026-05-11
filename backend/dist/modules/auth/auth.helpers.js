"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAccessToken = generateAccessToken;
exports.toPublicUser = toPublicUser;
exports.ensureUserCanLogin = ensureUserCanLogin;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const AppError_1 = require("../../shared/errors/AppError");
const env_1 = require("../../config/env");
const enums_1 = require("../../shared/types/enums");
function generateAccessToken(userId, role) {
    return jsonwebtoken_1.default.sign({ role }, env_1.env.JWT_SECRET, {
        subject: userId,
        expiresIn: env_1.env.JWT_EXPIRES_IN,
        //issuer: env.JWT_ISSUER,
        //audience: env.JWT_AUDIENCE,
    });
}
function toPublicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}
function ensureUserCanLogin(status) {
    if (status === enums_1.UserStatus.BLOCKED) {
        throw new AppError_1.AppError('User is blocked', 403, 'USER_BLOCKED');
    }
    if (status === enums_1.UserStatus.INACTIVE) {
        throw new AppError_1.AppError('User is inactive', 403, 'USER_INACTIVE');
    }
}
