import { AppError } from '../../shared/errors/AppError';
import { UserRole, VehicleStatus } from '../../shared/types/enums';
import { usersRepository } from '../users/users.repository';
import { CreateVehicleData, UpdateVehicleData } from './vehicles.repository.types';
import { vehiclesRepository } from './vehicles.repository';
import { assignmentsRepository } from './assignments.repository';
import { forceActivation as forceActivationLogic } from './activation.service';
import { prisma } from '../../config/prisma';
import { CreateVehicleInput, UpdateVehicleInput } from './vehicles.service.types';
import {
  IVehiclePublic, IVehicleAssignmentWithUser, IVehicleAssignmentWithVehicle,
} from './vehicles.types';

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

  async create(actor: Actor, userId: string, input: CreateVehicleInput): Promise<IVehiclePublic> {
    if (!canManageVehicles(actor.role) && userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'CANNOT_CREATE_VEHICLE_FOR_ANOTHER_USER');
    }

    await this.ensureUserExists(userId);

    const existingVehicle = await vehiclesRepository.findByPlate(input.plate);
    if (existingVehicle) {
      throw new AppError('Plate already in use', 409, 'PLATE_ALREADY_IN_USE');
    }

    const data: CreateVehicleData = {
      brand: input.brand,
      model: input.model,
      plate: input.plate,
      year: input.year,
      vin: input.vin,
      status: input.status ?? VehicleStatus.PENDING, // nasce pendente até os documentos serem aprovados
      userId: userId,
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
      ...(input.vin !== undefined ? { vin: input.vin } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };

    return vehiclesRepository.update(id, data);
  }

  async remove(actor: Actor, id: string): Promise<void> {
    
    const vehicle = await this.ensureVehicleExists(id)

    if (!canManageVehicles(actor.role) && vehicle.userId !== actor.id ) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    await this.ensureVehicleExists(id);

    return vehiclesRepository.delete(id);
  }

  // ── Atribuição (só admin/manager) ──────────────────────────────────────────

  /**
   * Atribui um veículo a um motorista. Fecha a atribuição anterior (se houver),
   * abre uma nova no histórico e atualiza o motorista atual do veículo — tudo
   * numa transação para ficar sempre coerente.
   */
  async assign(actor: Actor, vehicleId: string, userId: string): Promise<IVehiclePublic> {
    if (!canManageVehicles(actor.role)) {
      throw new AppError('Apenas administradores podem atribuir veículos.', 403, 'FORBIDDEN');
    }

    await this.ensureVehicleExists(vehicleId);
    await this.ensureUserExists(userId);

    const open = await assignmentsRepository.findOpenByVehicle(vehicleId);
    // Já atribuído a este mesmo motorista? Nada a fazer.
    if (open && open.userId === userId) {
      return this.ensureVehicleExists(vehicleId);
    }

    await prisma.$transaction([
      // Fecha a atribuição aberta (se houver)
      prisma.vehicleAssignment.updateMany({
        where: { vehicleId, endedAt: null },
        data: { endedAt: new Date() },
      }),
      // Abre a nova atribuição
      prisma.vehicleAssignment.create({
        data: { vehicleId, userId },
      }),
      // Atualiza o motorista atual do veículo
      prisma.vehicle.update({
        where: { id: vehicleId },
        data: { userId },
      }),
    ]);

    return this.ensureVehicleExists(vehicleId);
  }

  /**
   * Remove a atribuição atual do veículo (fica "não atribuído"). Fecha a
   * atribuição aberta no histórico e limpa o motorista atual.
   */
  async unassign(actor: Actor, vehicleId: string): Promise<IVehiclePublic> {
    if (!canManageVehicles(actor.role)) {
      throw new AppError('Apenas administradores podem desatribuir veículos.', 403, 'FORBIDDEN');
    }

    await this.ensureVehicleExists(vehicleId);

    await prisma.$transaction([
      prisma.vehicleAssignment.updateMany({
        where: { vehicleId, endedAt: null },
        data: { endedAt: new Date() },
      }),
      prisma.vehicle.update({
        where: { id: vehicleId },
        data: { userId: null },
      }),
    ]);

    return this.ensureVehicleExists(vehicleId);
  }

  /** Histórico de atribuições de um veículo (só admin/manager). */
  async getAssignmentHistory(actor: Actor, vehicleId: string): Promise<IVehicleAssignmentWithUser[]> {
    if (!canManageVehicles(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    await this.ensureVehicleExists(vehicleId);
    return assignmentsRepository.listByVehicle(vehicleId);
  }

  /**
   * Histórico de veículos de um motorista.
   *
   * Restrito à gestão, como o histórico por veículo: é informação operacional
   * sobre a frota, não dados pessoais do próprio.
   */
  async getDriverVehicleHistory(
    actor: Actor,
    userId: string,
  ): Promise<IVehicleAssignmentWithVehicle[]> {
    if (!canManageVehicles(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    return assignmentsRepository.listByUser(userId);
  }

  // ── Ativação híbrida (só admin/manager) ────────────────────────────────────

  /**
   * Admin força (ou remove a força de) a ativação de um veículo.
   * forced=true → veículo fica ACTIVE mesmo sem os documentos todos.
   * forced=false → volta a seguir a regra automática dos documentos.
   */
  async setForcedActivation(actor: Actor, vehicleId: string, forced: boolean): Promise<IVehiclePublic> {
    if (!canManageVehicles(actor.role)) {
      throw new AppError('Apenas administradores podem forçar a ativação.', 403, 'FORBIDDEN');
    }
    await this.ensureVehicleExists(vehicleId);
    await forceActivationLogic(vehicleId, forced);
    return this.ensureVehicleExists(vehicleId);
  }
}

export const vehiclesService = new VehiclesService();