"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vehiclesRepository = exports.VehiclesRepository = void 0;
const prisma_1 = require("../../config/prisma");
const logger_1 = require("../../shared/utils/logger");
class VehiclesRepository {
    constructor() {
        this.publicSelect = {
            id: true,
            brand: true,
            model: true,
            plate: true,
            year: true,
            status: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
        };
    }
    async findAll() {
        try {
            return await prisma_1.prisma.vehicle.findMany({
                select: this.publicSelect,
                orderBy: { createdAt: 'desc' },
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar veículos', err);
            throw err;
        }
    }
    async findById(id) {
        try {
            return await prisma_1.prisma.vehicle.findUnique({
                where: { id },
                select: this.publicSelect,
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar veículo por id', err);
            throw err;
        }
    }
    async findByPlate(plate) {
        try {
            return await prisma_1.prisma.vehicle.findUnique({
                where: { plate },
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar veículo por placa', err);
            throw err;
        }
    }
    async findByUserId(userId) {
        try {
            return await prisma_1.prisma.vehicle.findMany({
                where: { userId },
                select: this.publicSelect,
                orderBy: { createdAt: 'desc' },
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao buscar veículos por utilizador', err);
            throw err;
        }
    }
    async create(data) {
        try {
            return await prisma_1.prisma.vehicle.create({
                data: {
                    brand: data.brand,
                    model: data.model,
                    plate: data.plate,
                    year: data.year,
                    status: data.status,
                    userId: data.userId,
                },
                select: this.publicSelect,
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao criar veículo', err);
            throw err;
        }
    }
    async update(id, data) {
        try {
            return await prisma_1.prisma.vehicle.update({
                where: { id },
                data: {
                    ...(data.brand !== undefined ? { brand: data.brand } : {}),
                    ...(data.model !== undefined ? { model: data.model } : {}),
                    ...(data.plate !== undefined ? { plate: data.plate } : {}),
                    ...(data.year !== undefined ? { year: data.year } : {}),
                    ...(data.status !== undefined ? { status: data.status } : {}),
                },
                select: this.publicSelect,
            });
        }
        catch (err) {
            logger_1.logger.error('Erro ao atualizar veículo', err);
            throw err;
        }
    }
    async delete(id) {
        try {
            await prisma_1.prisma.vehicle.delete({ where: { id } });
        }
        catch (err) {
            logger_1.logger.error('Erro ao deletar veículo', err);
            throw err;
        }
    }
}
exports.VehiclesRepository = VehiclesRepository;
exports.vehiclesRepository = new VehiclesRepository();
