"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const AppError_1 = require("../../shared/errors/AppError");
const users_repository_1 = require("../users/users.repository");
const auth_helpers_1 = require("./auth.helpers");
class AuthService {
    async login(input) {
        const user = await users_repository_1.usersRepository.findByEmail(input.email);
        if (!user) {
            throw new AppError_1.AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
        }
        const passwordMatch = await bcrypt_1.default.compare(input.password, user.password);
        if (!passwordMatch) {
            throw new AppError_1.AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
        }
        (0, auth_helpers_1.ensureUserCanLogin)(user.status);
        const token = (0, auth_helpers_1.generateAccessToken)(user.id, user.role);
        return {
            token,
            user: (0, auth_helpers_1.toPublicUser)(user),
        };
    }
    async logout() {
        // JWT stateless:
        // o backend não invalida o token sozinho.
        // O cliente deve remover o token armazenado.
        return;
    }
    async me(userId) {
        const user = await users_repository_1.usersRepository.findById(userId);
        if (!user) {
            throw new AppError_1.AppError('User not found', 404, 'USER_NOT_FOUND');
        }
        return user;
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
