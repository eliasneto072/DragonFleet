"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.earningsRepository = exports.EarningRepository = void 0;
const prisma_1 = require("../../config/prisma");
const logger_1 = require("../../shared/utils/logger");
class EarningRepository {
    constructor() {
        this.publicSelect = {
            id: true,
            amount: true,
            date: true,
            platform: true,
            userId: true,
            createdAt: true,
        };
    }
    async findAll() {
        try {
            const earnings = await prisma_1.prisma.earning.findMany({
                select: this.publicSelect,
                orderBy: { createdAt: 'desc' },
            });
            return earnings.map((e) => ({ ...e, amount: e.amount.toNumber() }));
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar ganhos', err);
            throw err;
        }
    }
    async findById(id) {
        try {
            const earning = await prisma_1.prisma.earning.findUnique({
                where: { id },
                select: this.publicSelect,
            });
            if (!earning)
                return null;
            return { ...earning, amount: earning.amount.toNumber() };
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar ganho por id', err);
            throw err;
        }
    }
    async findByUserId(userId) {
        try {
            const earnings = await prisma_1.prisma.earning.findMany({
                where: { userId },
                select: this.publicSelect,
                orderBy: { date: 'desc' },
            });
            return earnings.map((e) => ({ ...e, amount: e.amount.toNumber() }));
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar ganhos por usuário', err);
            throw err;
        }
    }
    async create(data) {
        try {
            const earning = await prisma_1.prisma.earning.create({
                data: {
                    amount: data.amount,
                    date: data.date,
                    platform: data.platform,
                    userId: data.userId,
                },
                select: this.publicSelect,
            });
            return { ...earning, amount: earning.amount.toNumber() };
        }
        catch (err) {
            logger_1.logger.error('Erro ao criar ganho', err);
            throw err;
        }
    }
    async update(id, data) {
        try {
            const earning = await prisma_1.prisma.earning.update({
                where: { id },
                data: {
                    ...(data.amount !== undefined ? { amount: data.amount } : {}),
                    ...(data.date !== undefined ? { date: data.date } : {}),
                    ...(data.platform !== undefined ? { platform: data.platform } : {}),
                },
                select: this.publicSelect,
            });
            return { ...earning, amount: earning.amount.toNumber() };
        }
        catch (err) {
            logger_1.logger.error('Erro ao atualizar ganho', err);
            throw err;
        }
    }
    async delete(id) {
        try {
            await prisma_1.prisma.earning.delete({ where: { id } });
        }
        catch (err) {
            logger_1.logger.error('Erro ao deletar ganho', err);
            throw err;
        }
    }
}
exports.EarningRepository = EarningRepository;
exports.earningsRepository = new EarningRepository();
