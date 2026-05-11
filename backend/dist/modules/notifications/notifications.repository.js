"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsRepository = exports.NotificationsRepository = void 0;
const prisma_1 = require("../../config/prisma");
const logger_1 = require("../../shared/utils/logger");
class NotificationsRepository {
    constructor() {
        this.publicSelect = {
            id: true,
            title: true,
            message: true,
            read: true,
            userId: true,
            createdAt: true,
        };
    }
    async findAll() {
        try {
            return await prisma_1.prisma.notification.findMany({
                select: this.publicSelect,
                orderBy: { createdAt: 'desc' }
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar notifications', err);
            throw err;
        }
    }
    async findById(id) {
        try {
            return await prisma_1.prisma.notification.findUnique({
                where: { id },
                select: this.publicSelect
            });
        }
        catch (err) {
            logger_1.logger.error('Erro', err);
            throw err;
        }
    }
    async findByUserId(userId) {
        try {
            return await prisma_1.prisma.notification.findMany({
                where: { userId },
                select: this.publicSelect,
                orderBy: { createdAt: 'desc' },
            });
        }
        catch (err) {
            logger_1.logger.error('Erro', err);
            throw err;
        }
    }
    async create(data) {
        try {
            const newData = {
                title: data.title,
                message: data.message,
                userId: data.userId,
            };
            return await prisma_1.prisma.notification.create({
                data: newData,
                select: this.publicSelect,
            });
        }
        catch (err) {
            logger_1.logger.error('Erro', err);
            throw err;
        }
    }
    async update(id, data) {
        try {
            return await prisma_1.prisma.notification.update({
                where: { id },
                data: {
                    ...(data.title !== undefined ? { title: data.title } : {}),
                    ...(data.message !== undefined ? { message: data.message } : {}),
                    ...(data.read !== undefined ? { read: data.read } : {})
                },
                select: this.publicSelect
            });
        }
        catch (err) {
            logger_1.logger.error('Erro', err);
            throw err;
        }
    }
    async delete(id) {
        try {
            await prisma_1.prisma.notification.delete({
                where: { id },
            });
        }
        catch (err) {
            logger_1.logger.error('Erro', err);
            throw err;
        }
    }
}
exports.NotificationsRepository = NotificationsRepository;
exports.notificationsRepository = new NotificationsRepository();
