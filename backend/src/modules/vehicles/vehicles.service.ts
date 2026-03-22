import { AppError } from '../../shared/errors/AppError';
import { UserRole, VehicleStatus } from '../../shared/types/enums';
import { usersRepository } from '../users/users.repository';
import { CreateVehicleData, UpdateVehicleData } from './vehicles.repository.types';
import { vehiclesRepository } from './vehicles.repository';
import { CreateVehicleInput, UpdateVehicleInput } from './vehicles.service.types';
import { IVehiclePublic } from './vehicles.types';

type Actor = {
  id: string;
  role?: UserRole;
};

function canManageVehicles(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export class VehiclesService {
  private async ensureVehicleExists(id: string): Promise<IVehiclePublic> {
    const vehicle = await vehiclesRepository.findById(id);

    if (!vehicle) {
      throw new AppError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
    }

    return vehicle;
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await usersRepository.findById(userId);

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
  }

  async list(actor: Actor): Promise<IVehiclePublic[]> {
    const vehicles = await vehiclesRepository.findAll();

    if (canManageVehicles(actor.role)) {
      return vehicles;
    }

    return vehicles.filter((vehicle) => vehicle.userId === actor.id);
  }

  async listByUser(actor: Actor, userId: string): Promise<IVehiclePublic[]> {
    if (!canManageVehicles(actor.role) && actor.id !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    await this.ensureUserExists(userId);

    return vehiclesRepository.findByUserId(userId);
  }

  async getById(actor: Actor, id: string): Promise<IVehiclePublic> {
    const vehicle = await this.ensureVehicleExists(id);

    if (!canManageVehicles(actor.role) && vehicle.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    return vehicle;
  }

  async create(actor: Actor, input: CreateVehicleInput): Promise<IVehiclePublic> {
    if (!canManageVehicles(actor.role) && input.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'CANNOT_CREATE_VEHICLE_FOR_ANOTHER_USER');
    }

    await this.ensureUserExists(input.userId);

    const existingVehicle = await vehiclesRepository.findByPlate(input.plate);
    if (existingVehicle) {
      throw new AppError('Plate already in use', 409, 'PLATE_ALREADY_IN_USE');
    }

    const data: CreateVehicleData = {
      brand: input.brand,
      model: input.model,
      plate: input.plate,
      year: input.year,
      status: input.status ?? VehicleStatus.ACTIVE,
      userId: input.userId,
    };

    return vehiclesRepository.create(data);
  }

  async update(actor: Actor, id: string, input: UpdateVehicleInput): Promise<IVehiclePublic> {
    const vehicle = await this.ensureVehicleExists(id);

    if (!canManageVehicles(actor.role) && vehicle.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    if (!canManageVehicles(actor.role) && input.status !== undefined) {
      throw new AppError('Forbidden', 403, 'CANNOT_CHANGE_VEHICLE_STATUS');
    }

    if (input.plate) {
      const existingVehicle = await vehiclesRepository.findByPlate(input.plate);

      if (existingVehicle && existingVehicle.id !== id) {
        throw new AppError('Plate already in use', 409, 'PLATE_ALREADY_IN_USE');
      }
    }

    const data: UpdateVehicleData = {
      ...(input.brand !== undefined ? { brand: input.brand } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.plate !== undefined ? { plate: input.plate } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };

    return vehiclesRepository.update(id, data);
  }

  async remove(actor: Actor, id: string): Promise<void> {
    if (!canManageVehicles(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    await this.ensureVehicleExists(id);

    return vehiclesRepository.delete(id);
  }
}

export const vehiclesService = new VehiclesService();