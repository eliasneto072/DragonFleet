"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRepository = exports.UsersRepository = void 0;
const prisma_1 = require("../../config/prisma");
const logger_1 = require("../../shared/utils/logger");
class UsersRepository {
    constructor() {
        this.publicSelect = {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
        };
    }
    async findAll() {
        try {
            return await prisma_1.prisma.user.findMany({
                select: this.publicSelect,
                orderBy: { createdAt: 'desc' }
            });
        }
        catch (err) {
            logger_1.logger.error("Erro ao buscar usuários", err);
            throw err; // deixa middleware de erro tratar
        }
    }
    async findById(id) {
        try {
            return await prisma_1.prisma.user.findUnique({
                where: { id },
                select: this.publicSelect
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar usuário', err);
            throw err;
        }
    }
    // esse retorna com password (usado apenas no auth/login)
    async findByEmail(email) {
        try {
            return await prisma_1.prisma.user.findUnique({ where: { email } });
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar usuário por email', err);
            throw err;
        }
    }
    async create(data) {
        try {
            return await prisma_1.prisma.user.create({
                data: {
                    name: data.name,
                    email: data.email,
                    password: data.password,
                    role: data.role,
                    status: data.status,
                },
                select: this.publicSelect,
            });
        }
        catch (err) {
            logger_1.logger.error("Erro ao criar usuário", err);
            throw err;
        }
    }
    async update(id, data) {
        try {
            return await prisma_1.prisma.user.update({
                where: { id },
                data: {
                    ...(data.name !== undefined ? { name: data.name } : {}),
                    ...(data.email !== undefined ? { email: data.email } : {}),
                    ...(data.password !== undefined ? { password: data.password } : {}),
                    ...(data.role !== undefined ? { role: data.role } : {}),
                    ...(data.status !== undefined ? { status: data.status } : {}),
                },
                select: this.publicSelect,
            });
        }
        catch (err) {
            logger_1.logger.error("Erro ao atualizar usuário", err);
            throw err;
        }
    }
    async delete(id) {
        try {
            await prisma_1.prisma.user.delete({ where: { id } });
        }
        catch (err) {
            logger_1.logger.error("Erro ao deletar usuário", err);
            throw err;
        }
    }
}
exports.UsersRepository = UsersRepository;
exports.usersRepository = new UsersRepository();
