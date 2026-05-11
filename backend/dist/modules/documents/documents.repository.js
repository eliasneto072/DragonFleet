"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentsRepository = exports.DocumentsRepository = void 0;
const prisma_1 = require("../../config/prisma");
const logger_1 = require("../../shared/utils/logger");
class DocumentsRepository {
    constructor() {
        this.publicSelect = {
            id: true,
            type: true,
            fileUrl: true,
            fileKey: true,
            status: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
        };
    }
    async findAll() {
        try {
            return await prisma_1.prisma.document.findMany({
                select: this.publicSelect,
                orderBy: { createdAt: 'desc' },
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar documentos', err);
            throw err;
        }
    }
    async findById(id) {
        try {
            return await prisma_1.prisma.document.findUnique({
                where: { id },
                select: this.publicSelect,
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar documento por id', err);
            throw err;
        }
    }
    async findByUserId(userId) {
        try {
            return await prisma_1.prisma.document.findMany({
                where: { userId },
                select: this.publicSelect,
                orderBy: { createdAt: 'desc' },
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar documentos por usuário', err);
            throw err;
        }
    }
    async findByUserIdAndType(userId, type) {
        try {
            // Como não existe unique composto (userId, type) no schema atual,
            // usamos findFirst.
            return await prisma_1.prisma.document.findFirst({
                where: { userId, type },
                select: this.publicSelect,
                orderBy: { createdAt: 'desc' },
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar documento por usuário e tipo', err);
            throw err;
        }
    }
    async create(data) {
        try {
            return await prisma_1.prisma.document.create({
                data: {
                    type: data.type,
                    fileUrl: data.fileUrl,
                    fileKey: data.fileKey, // ← novo
                    status: data.status,
                    userId: data.userId,
                },
                select: this.publicSelect,
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao criar documento', err);
            throw err;
        }
    }
    async update(id, data) {
        try {
            return await prisma_1.prisma.document.update({
                where: { id },
                data: {
                    ...(data.type !== undefined ? { type: data.type } : {}),
                    ...(data.fileUrl !== undefined ? { fileUrl: data.fileUrl } : {}),
                    ...(data.status !== undefined ? { status: data.status } : {}),
                },
                select: this.publicSelect,
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao atualizar documento', err);
            throw err;
        }
    }
    async delete(id) {
        try {
            await prisma_1.prisma.document.delete({
                where: { id },
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao deletar documento', err);
            throw err;
        }
    }
}
exports.DocumentsRepository = DocumentsRepository;
exports.documentsRepository = new DocumentsRepository();
