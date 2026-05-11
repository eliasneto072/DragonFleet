"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalsRepository = exports.WithdrawalsRepository = void 0;
const prisma_1 = require("../../config/prisma");
const logger_1 = require("../../shared/utils/logger");
class WithdrawalsRepository {
    constructor() {
        this.publicSelect = {
            id: true,
            amount: true,
            status: true,
            notes: true,
            requestedAt: true,
            processedAt: true,
            userId: true,
        };
    }
    async findAll() {
        try {
            const withdrawals = await prisma_1.prisma.withdrawal.findMany({
                select: this.publicSelect,
                orderBy: { requestedAt: 'desc' },
            });
            return withdrawals.map((w) => ({ ...w, amount: w.amount.toNumber() }));
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar saques', err);
            throw err;
        }
    }
    async findById(id) {
        try {
            const withdrawal = await prisma_1.prisma.withdrawal.findUnique({
                where: { id },
                select: this.publicSelect,
            });
            if (!withdrawal)
                return null;
            return { ...withdrawal, amount: withdrawal.amount.toNumber() };
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar saque por id', err);
            throw err;
        }
    }
    async findByUserId(userId) {
        try {
            const withdrawals = await prisma_1.prisma.withdrawal.findMany({
                where: { userId },
                select: this.publicSelect,
                orderBy: { requestedAt: 'desc' },
            });
            return withdrawals.map((w) => ({ ...w, amount: w.amount.toNumber() }));
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar saques por utilizador', err);
            throw err;
        }
    }
    async create(data) {
        try {
            const withdrawal = await prisma_1.prisma.withdrawal.create({
                data: {
                    amount: data.amount,
                    userId: data.userId,
                    // status omitido — Prisma aplica PENDING por default
                },
                select: this.publicSelect,
            });
            return { ...withdrawal, amount: withdrawal.amount.toNumber() };
        }
        catch (err) {
            logger_1.logger.error('Erro ao criar saque', err);
            throw err;
        }
    }
    async update(id, data) {
        try {
            const withdrawal = await prisma_1.prisma.withdrawal.update({
                where: { id },
                data: {
                    ...(data.status !== undefined ? { status: data.status } : {}),
                    ...(data.notes !== undefined ? { notes: data.notes } : {}),
                    // processedAt preenchido automaticamente quando status muda para APPROVED, REJECTED ou PAID
                    ...(data.status !== undefined ? { processedAt: new Date() } : {}),
                },
                select: this.publicSelect,
            });
            return { ...withdrawal, amount: withdrawal.amount.toNumber() };
        }
        catch (err) {
            logger_1.logger.error('Erro ao atualizar saque', err);
            throw err;
        }
    }
    async delete(id) {
        try {
            await prisma_1.prisma.withdrawal.delete({ where: { id } });
        }
        catch (err) {
            logger_1.logger.error('Erro ao deletar saque', err);
            throw err;
        }
    }
}
exports.WithdrawalsRepository = WithdrawalsRepository;
exports.withdrawalsRepository = new WithdrawalsRepository();
