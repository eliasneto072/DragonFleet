"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VehiclesService = void 0;
const AppError_1 = require("../../shared/errors/AppError");
class VehiclesService {
    constructor(vehiclesRepository) {
        this.vehiclesRepository = vehiclesRepository;
    }
    async create(data) {
        const vehicleAlreadyExists = await this.vehiclesRepository.findByPlate(data.plate);
        if (vehicleAlreadyExists) {
            throw new AppError_1.AppError("Vehicle already exists with this plate", 409);
        }
        return this.vehiclesRepository.create(data);
    }
    async findAll(actor) {
        return this.vehiclesRepository.findAllByUser(actor.id);
    }
    //Bloquear visualização de veículo que não pertence ao usuário.
    async findById(actor, id, vehicleId, loggedUserId // ← NOVO PARÂMETRO
    ) {
        const vehicle = await this.vehiclesRepository.findById(vehicleId);
        if (actor.id != id) {
            throw new AppError_1.AppError('Unauthorizated', 401, 'Unauthorizated');
        }
        if (!vehicle) {
            throw new AppError_1.AppError("Vehicle not found", 404);
        }
        // 🔐 REGRA DE AUTORIZAÇÃO
        if (vehicle.userId !== loggedUserId) {
            throw new AppError_1.AppError("You are not allowed to view this vehicle", 403);
        }
        return vehicle;
    }
    // 🔥 ALTERAÇÃO AQUI
    async update(actor, vehicleId, data, loggedUserId // ← NOVO PARÂMETRO
    ) {
        const vehicleExists = await this.vehiclesRepository.findById(vehicleId);
        if (!vehicleExists) {
            throw new AppError_1.AppError("Vehicle not found", 404);
        }
        // 🔥 REGRA DE AUTORIZAÇÃO
        if (vehicleExists.userId !== loggedUserId) {
            throw new AppError_1.AppError("You are not allowed to update this vehicle", 403);
        }
        if (data.plate) {
            const plateAlreadyExists = await this.vehiclesRepository.findByPlate(data.plate);
            if (plateAlreadyExists && plateAlreadyExists.id !== vehicleId) {
                throw new AppError_1.AppError("Another vehicle already uses this plate", 409);
            }
        }
        return this.vehiclesRepository.update(vehicleId, data);
    }
    // 🔥 APENAS O DONO DO VEÍCULO PODE ATUALIZAR A PLACA.
    async delete(actor, vehicleId, loggedUserId) {
        const vehicleExists = await this.vehiclesRepository.findById(vehicleId);
        if (!vehicleExists) {
            throw new AppError_1.AppError("Vehicle not found", 404);
        }
        // 🔥 REGRA DE AUTORIZAÇÃO
        if (vehicleExists.userId !== loggedUserId) {
            throw new AppError_1.AppError("You are not allowed to delete this vehicle", 403);
        }
        await this.vehiclesRepository.delete(vehicleId);
    }
}
exports.VehiclesService = VehiclesService;
