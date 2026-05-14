"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersService = exports.UsersService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const AppError_1 = require("../../shared/errors/AppError");
const users_repository_1 = require("./users.repository");
const enums_1 = require("../../shared/types/enums");
function isAdmin(role) {
    return role === enums_1.UserRole.ADMIN;
}
class UsersService {
    async ensureUserExists(id) {
        const user = await users_repository_1.usersRepository.findById(id);
        if (!user) {
            throw new AppError_1.AppError('User not found', 404, 'USER_NOT_FOUND');
        }
        return user;
    }
    async list(actor) {
        if (!isAdmin(actor.role)) {
            throw new AppError_1.AppError('Forbidden', 403);
        }
        return users_repository_1.usersRepository.findAll();
    }
    async getById(actor, id) {
        if (!isAdmin(actor.role) && actor.id !== id) {
            throw new AppError_1.AppError('Forbidden', 403);
        }
        return this.ensureUserExists(id);
    }
    async create(input) {
        //  if (!isAdmin(actor.role)) {
        //    throw new AppError('Forbidden', 403);
        //  }
        const existingUser = await users_repository_1.usersRepository.findByEmail(input.email);
        if (existingUser) {
            throw new AppError_1.AppError('Email already in use', 409, 'EMAIL_IN_USE');
        }
        const passwordHash = await bcrypt_1.default.hash(input.password, 10);
        const data = {
            name: input.name,
            email: input.email,
            password: passwordHash,
            role: input.role ?? enums_1.UserRole.DRIVER,
            status: input.status ?? enums_1.UserStatus.ACTIVE,
        };
        return users_repository_1.usersRepository.create(data);
    }
    async update(actor, id, input) {
        const isSelf = actor.id === id;
        if (!isAdmin(actor.role) && !isSelf) {
            throw new AppError_1.AppError('Forbidden', 403);
        }
        await this.ensureUserExists(id);
        if (!isAdmin(actor.role)) {
            const allowedFieldsForSelf = ['name', 'email', 'password'];
            const keys = Object.keys(input);
            const allowed = keys.every((key) => allowedFieldsForSelf.includes(key));
            if (!allowed) {
                throw new AppError_1.AppError('Forbidden', 403, 'CANNOT_CHANGE_RESTRICTED_FIELDS');
            }
        }
        if (input.email) {
            const existingUser = await users_repository_1.usersRepository.findByEmail(input.email);
            if (existingUser && existingUser.id !== id) {
                throw new AppError_1.AppError('Email already in use', 409, 'EMAIL_IN_USE');
            }
        }
        const data = {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.email !== undefined ? { email: input.email } : {}),
            ...(input.role !== undefined ? { role: input.role } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
        };
        if (input.password) {
            data.password = await bcrypt_1.default.hash(input.password, 10);
        }
        return users_repository_1.usersRepository.update(id, data);
    }
    async remove(actor, id) {
        if (!isAdmin(actor.role)) {
            throw new AppError_1.AppError('Forbidden', 403);
        }
        await this.ensureUserExists(id);
        return users_repository_1.usersRepository.delete(id);
    }
}
exports.UsersService = UsersService;
exports.usersService = new UsersService();
