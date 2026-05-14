"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalsService = exports.WithdrawalsService = void 0;
const AppError_1 = require("../../shared/errors/AppError");
const enums_1 = require("../../shared/types/enums");
const users_repository_1 = require("../users/users.repository");
const withdrawals_repository_1 = require("./withdrawals.repository");
function canManageWithdrawals(role) {
    return role === enums_1.UserRole.ADMIN || role === enums_1.UserRole.MANAGER;
}
// Status finais — não podem ser alterados
const FINAL_STATUSES = [enums_1.WithdrawalStatus.PAID, enums_1.WithdrawalStatus.REJECTED];
class WithdrawalsService {
    async ensureWithdrawalExists(id) {
        const withdrawal = await withdrawals_repository_1.withdrawalsRepository.findById(id);
        if (!withdrawal) {
            throw new AppError_1.AppError('Withdrawal not found', 404, 'WITHDRAWAL_NOT_FOUND');
        }
        return withdrawal;
    }
    async ensureUserExists(userId) {
        const user = await users_repository_1.usersRepository.findById(userId);
        if (!user) {
            throw new AppError_1.AppError('User not found', 404, 'USER_NOT_FOUND');
        }
    }
    async list(actor) {
        if (canManageWithdrawals(actor.role)) {
            return withdrawals_repository_1.withdrawalsRepository.findAll();
        }
        return withdrawals_repository_1.withdrawalsRepository.findByUserId(actor.id);
    }
    async listByUser(actor, userId) {
        if (!canManageWithdrawals(actor.role) && actor.id !== userId) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        await this.ensureUserExists(userId);
        return withdrawals_repository_1.withdrawalsRepository.findByUserId(userId);
    }
    async getById(actor, id) {
        const withdrawal = await this.ensureWithdrawalExists(id);
        if (!canManageWithdrawals(actor.role) && withdrawal.userId !== actor.id) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        return withdrawal;
    }
    async create(actor, userId, input) {
        if (!canManageWithdrawals(actor.role) && userId !== actor.id) {
            throw new AppError_1.AppError('Forbidden', 403, 'CANNOT_CREATE_WITHDRAWAL_FOR_ANOTHER_USER');
        }
        await this.ensureUserExists(userId);
        const data = {
            amount: input.amount,
            userId,
        };
        return withdrawals_repository_1.withdrawalsRepository.create(data);
    }
    async updateStatus(actor, id, input) {
        if (!canManageWithdrawals(actor.role)) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        const withdrawal = await this.ensureWithdrawalExists(id);
        // Não permite alterar status de saques já finalizados
        if (FINAL_STATUSES.includes(withdrawal.status)) {
            throw new AppError_1.AppError(`Cannot change status of a ${withdrawal.status} withdrawal`, 400, 'INVALID_STATUS_TRANSITION');
        }
        // Notes obrigatório ao rejeitar
        if (input.status === enums_1.WithdrawalStatus.REJECTED && !input.notes) {
            throw new AppError_1.AppError('Notes are required when rejecting a withdrawal', 400, 'NOTES_REQUIRED');
        }
        const data = {
            status: input.status,
            notes: input.notes ?? null,
        };
        return withdrawals_repository_1.withdrawalsRepository.update(id, data);
    }
    async remove(actor, id) {
        if (!canManageWithdrawals(actor.role)) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        await this.ensureWithdrawalExists(id);
        return withdrawals_repository_1.withdrawalsRepository.delete(id);
    }
}
exports.WithdrawalsService = WithdrawalsService;
exports.withdrawalsService = new WithdrawalsService();
