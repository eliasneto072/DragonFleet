"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vehiclesService = exports.VehiclesService = void 0;
const AppError_1 = require("../../shared/errors/AppError");
const enums_1 = require("../../shared/types/enums");
const users_repository_1 = require("../users/users.repository");
const vehicles_repository_1 = require("./vehicles.repository");
function canManageVehicles(role) {
    return role === enums_1.UserRole.ADMIN || role === enums_1.UserRole.MANAGER;
}
class VehiclesService {
    async ensureVehicleExists(id) {
        const vehicle = await vehicles_repository_1.vehiclesRepository.findById(id);
        if (!vehicle) {
            throw new AppError_1.AppError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
        }
        return vehicle;
    }
    async ensureUserExists(userId) {
        const user = await users_repository_1.usersRepository.findById(userId);
        if (!user) {
            throw new AppError_1.AppError('User not found', 404, 'USER_NOT_FOUND');
        }
    }
    async list(actor) {
        const vehicles = await vehicles_repository_1.vehiclesRepository.findAll();
        if (canManageVehicles(actor.role)) {
            return vehicles;
        }
        return vehicles.filter((vehicle) => vehicle.userId === actor.id);
    }
    async listByUser(actor, userId) {
        if (!canManageVehicles(actor.role) && actor.id !== userId) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        await this.ensureUserExists(userId);
        return vehicles_repository_1.vehiclesRepository.findByUserId(userId);
    }
    async getById(actor, id) {
        const vehicle = await this.ensureVehicleExists(id);
        if (!canManageVehicles(actor.role) && vehicle.userId !== actor.id) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        return vehicle;
    }
    async create(actor, userId, input) {
        if (!canManageVehicles(actor.role) && userId !== actor.id) {
            throw new AppError_1.AppError('Forbidden', 403, 'CANNOT_CREATE_VEHICLE_FOR_ANOTHER_USER');
        }
        await this.ensureUserExists(userId);
        const existingVehicle = await vehicles_repository_1.vehiclesRepository.findByPlate(input.plate);
        if (existingVehicle) {
            throw new AppError_1.AppError('Plate already in use', 409, 'PLATE_ALREADY_IN_USE');
        }
        const data = {
            brand: input.brand,
            model: input.model,
            plate: input.plate,
            year: input.year,
            status: input.status ?? enums_1.VehicleStatus.ACTIVE,
            userId: userId,
        };
        return vehicles_repository_1.vehiclesRepository.create(data);
    }
    async update(actor, id, input) {
        const vehicle = await this.ensureVehicleExists(id);
        if (!canManageVehicles(actor.role) && vehicle.userId !== actor.id) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        if (!canManageVehicles(actor.role) && input.status !== undefined) {
            throw new AppError_1.AppError('Forbidden', 403, 'CANNOT_CHANGE_VEHICLE_STATUS');
        }
        if (input.plate) {
            const existingVehicle = await vehicles_repository_1.vehiclesRepository.findByPlate(input.plate);
            if (existingVehicle && existingVehicle.id !== id) {
                throw new AppError_1.AppError('Plate already in use', 409, 'PLATE_ALREADY_IN_USE');
            }
        }
        const data = {
            ...(input.brand !== undefined ? { brand: input.brand } : {}),
            ...(input.model !== undefined ? { model: input.model } : {}),
            ...(input.plate !== undefined ? { plate: input.plate } : {}),
            ...(input.year !== undefined ? { year: input.year } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
        };
        return vehicles_repository_1.vehiclesRepository.update(id, data);
    }
    async remove(actor, id) {
        const vehicle = await this.ensureVehicleExists(id);
        if (!canManageVehicles(actor.role) && vehicle.userId !== actor.id) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        await this.ensureVehicleExists(id);
        return vehicles_repository_1.vehiclesRepository.delete(id);
    }
}
exports.VehiclesService = VehiclesService;
exports.vehiclesService = new VehiclesService();
