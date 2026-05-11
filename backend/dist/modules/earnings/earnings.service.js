"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.earningsService = exports.EarningsService = void 0;
const AppError_1 = require("../../shared/errors/AppError");
const enums_1 = require("../../shared/types/enums");
const users_repository_1 = require("../users/users.repository");
const earnings_repository_1 = require("./earnings.repository");
function canManageEarnings(role) {
    return role === enums_1.UserRole.ADMIN || role === enums_1.UserRole.MANAGER;
}
class EarningsService {
    async ensureEarningExists(id) {
        const earning = await earnings_repository_1.earningsRepository.findById(id);
        if (!earning) {
            throw new AppError_1.AppError('Earning not found', 404, 'EARNING_NOT_FOUND');
        }
        return earning;
    }
    async ensureUserExists(userId) {
        const user = await users_repository_1.usersRepository.findById(userId);
        if (!user) {
            throw new AppError_1.AppError('User not found', 404, 'USER_NOT_FOUND');
        }
    }
    async list(actor) {
        if (canManageEarnings(actor.role)) {
            return earnings_repository_1.earningsRepository.findAll();
        }
        return earnings_repository_1.earningsRepository.findByUserId(actor.id);
    }
    async listByUser(actor, userId) {
        if (!canManageEarnings(actor.role) && actor.id !== userId) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        await this.ensureUserExists(userId);
        return earnings_repository_1.earningsRepository.findByUserId(userId);
    }
    async getById(actor, id) {
        const earning = await this.ensureEarningExists(id);
        if (!canManageEarnings(actor.role) && earning.userId !== actor.id) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        return earning;
    }
    // userId vem do controller (token ou body se admin especificar)
    async create(actor, userId, input) {
        if (!canManageEarnings(actor.role) && userId !== actor.id) {
            throw new AppError_1.AppError('Forbidden', 403, 'CANNOT_CREATE_EARNING_FOR_ANOTHER_USER');
        }
        await this.ensureUserExists(userId);
        const data = {
            amount: input.amount,
            date: input.date ?? new Date(),
            platform: input.platform,
            userId,
        };
        return earnings_repository_1.earningsRepository.create(data);
    }
    async update(actor, id, input) {
        const earning = await earnings_repository_1.earningsRepository.findById(id);
        if (!earning) {
            throw new AppError_1.AppError('Earning not found', 404, 'NOT_FOUND');
        }
        if (!canManageEarnings(actor.role) && earning.userId !== actor.id) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        await this.ensureEarningExists(id);
        const data = {
            ...(input.amount !== undefined ? { amount: input.amount } : {}),
            ...(input.date !== undefined ? { date: input.date } : {}),
            ...(input.platform !== undefined ? { platform: input.platform } : {}),
        };
        return earnings_repository_1.earningsRepository.update(id, data);
    }
    async remove(actor, id) {
        const earning = await this.ensureEarningExists(id);
        if (!canManageEarnings(actor.role) && earning.userId !== actor.id) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        await this.ensureEarningExists(id);
        return earnings_repository_1.earningsRepository.delete(id);
    }
}
exports.EarningsService = EarningsService;
exports.earningsService = new EarningsService();
