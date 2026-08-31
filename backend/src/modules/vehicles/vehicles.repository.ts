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
    vin: true,
    status: true,
    activationForced: true,
    weeklyFee: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  /**
   * weeklyFee é Decimal no Prisma e chegaria ao cliente como objeto, não como
   * número. Os restantes campos do veículo são primitivos, por isso esta é a
   * única conversão necessária — e tem de ser feita em todas as saídas.
   */
  private toPublic<T extends { weeklyFee?: unknown }>(v: T): IVehiclePublic {
    return {
      ...(v as unknown as IVehiclePublic),
      weeklyFee: Number(v.weeklyFee ?? 0),
    };
  }

  async findAll(): Promise<IVehiclePublic[]> {
    try {
      const rows = await prisma.vehicle.findMany({
        select: this.publicSelect,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((v) => this.toPublic(v));
    } catch (err) {
      logger.error('Erro ao buscar veículos', err);
      throw err;
    }
  }

  async findById(id: string): Promise<IVehiclePublic | null> {
    try {
      const row = await prisma.vehicle.findUnique({
        where: { id },
        select: this.publicSelect,
      });
      return row ? this.toPublic(row) : null;
    } catch (err) {
      logger.error('Erro ao buscar veículo por id', err);
      throw err;
    }
  }

  async findByPlate(plate: string): Promise<IVehicle | null> {
    try {
      const row = await prisma.vehicle.findUnique({
        where: { plate },
      });
      // findByPlate devolve o registo completo (inclui campos fora do
      // publicSelect); a conversão do Decimal aplica-se na mesma.
      return row ? (this.toPublic(row) as unknown as IVehicle) : null;
    } catch (err) {
      logger.error('Erro ao buscar veículo por placa', err);
      throw err;
    }
  }

  async findByUserId(userId: string): Promise<IVehiclePublic[]> {
    try {
      const rows = await prisma.vehicle.findMany({
        where: { userId },
        select: this.publicSelect,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((v) => this.toPublic(v));
    } catch (err) {
      logger.error('Erro ao buscar veículos por utilizador', err);
      throw err;
    }
  }

  async create(data: CreateVehicleData): Promise<IVehiclePublic> {
    try {
      const row = await prisma.vehicle.create({
        data: {
          brand: data.brand,
          model: data.model,
          plate: data.plate,
          year: data.year,
          status: data.status,
          userId: data.userId ?? null,
          ...(data.vin !== undefined ? { vin: data.vin } : {}),
          ...(data.weeklyFee !== undefined ? { weeklyFee: data.weeklyFee } : {}),
        },
        select: this.publicSelect,
      });
      return this.toPublic(row);
    } catch (err) {
      logger.error('Erro ao criar veículo', err);
      throw err;
    }
  }

  async update(id: string, data: UpdateVehicleData): Promise<IVehiclePublic> {
    try {
      const row = await prisma.vehicle.update({
        where: { id },
        data: {
          ...(data.brand !== undefined ? { brand: data.brand } : {}),
          ...(data.model !== undefined ? { model: data.model } : {}),
          ...(data.plate !== undefined ? { plate: data.plate } : {}),
          ...(data.year !== undefined ? { year: data.year } : {}),
          ...(data.vin !== undefined ? { vin: data.vin } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.activationForced !== undefined ? { activationForced: data.activationForced } : {}),
          ...(data.weeklyFee !== undefined ? { weeklyFee: data.weeklyFee } : {}),
          ...(data.userId !== undefined ? { userId: data.userId } : {}),
        },
        select: this.publicSelect,
      });
      return this.toPublic(row);
    } catch (err) {
      logger.error('Erro ao atualizar veículo', err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.vehicle.delete({ where: { id } });
    } catch (err) {
      logger.error('Erro ao deletar veículo', err);
      throw err;
    }
  }
}

export const vehiclesRepository = new VehiclesRepository();