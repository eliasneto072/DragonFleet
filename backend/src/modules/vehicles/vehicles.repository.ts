import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { IVehicleRepository } from './vehicles.repository.interfaces';
import { CreateVehicleData, UpdateVehicleData } from './vehicles.repository.types';
import { IVehicle, IVehiclePublic } from './vehicles.types';

export class VehiclesRepository implements IVehicleRepository {
  private readonly publicSelect = {
    id: true,
    brand: true,
    model: true,
    plate: true,
    year: true,
    status: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  async findAll(): Promise<IVehiclePublic[]> {
    try {
      return await prisma.vehicle.findMany({
        select: this.publicSelect,
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      logger.error('Erro ao buscar veículos', err);
      throw err;
    }
  }

  async findById(id: string): Promise<IVehiclePublic | null> {
    try {
      return await prisma.vehicle.findUnique({
        where: { id },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error('Erro ao buscar veículo por id', err);
      throw err;
    }
  }

  async findByPlate(plate: string): Promise<IVehicle | null> {
    try {
      return await prisma.vehicle.findUnique({
        where: { plate },
      });
    } catch (err) {
      logger.error('Erro ao buscar veículo por placa', err);
      throw err;
    }
  }

  async create(data: CreateVehicleData): Promise<IVehiclePublic> {
    try {
      return await prisma.vehicle.create({
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
    } catch (err) {
      logger.error('Erro ao criar veículo', err);
      throw err;
    }
  }

  async update(id: string, data: UpdateVehicleData): Promise<IVehiclePublic> {
    try {
      return await prisma.vehicle.update({
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
    } catch (err) {
      logger.error('Erro ao atualizar veículo', err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.vehicle.delete({
        where: { id },
      });
    } catch (err) {
      logger.error('Erro ao deletar veículo', err);
      throw err;
    }
  }
}

export const vehiclesRepository = new VehiclesRepository();