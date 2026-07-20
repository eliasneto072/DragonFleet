// src/modules/vehicles/assignments.repository.ts
//
// Acesso à tabela de histórico de atribuições (VehicleAssignment).

import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { IVehicleAssignment, IVehicleAssignmentWithUser } from './vehicles.types';

export class AssignmentsRepository {
  private readonly publicSelect = {
    id: true,
    vehicleId: true,
    userId: true,
    startedAt: true,
    endedAt: true,
  } as const;

  private readonly withUserSelect = {
    ...this.publicSelect,
    user: {
      select: { id: true, name: true, email: true, status: true, role: true, createdAt: true, updatedAt: true },
    },
  } as const;

  /** Atribuição atualmente aberta (sem endedAt) de um veículo, se existir. */
  async findOpenByVehicle(vehicleId: string): Promise<IVehicleAssignment | null> {
    try {
      return await prisma.vehicleAssignment.findFirst({
        where: { vehicleId, endedAt: null },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error('Erro ao buscar atribuição aberta', err);
      throw err;
    }
  }

  /** Histórico completo de um veículo (mais recente primeiro), com o motorista. */
  async listByVehicle(vehicleId: string): Promise<IVehicleAssignmentWithUser[]> {
    try {
      return await prisma.vehicleAssignment.findMany({
        where: { vehicleId },
        select: this.withUserSelect,
        orderBy: { startedAt: 'desc' },
      }) as unknown as IVehicleAssignmentWithUser[];
    } catch (err) {
      logger.error('Erro ao listar histórico de atribuições', err);
      throw err;
    }
  }

  /** Abre uma nova atribuição. */
  async open(vehicleId: string, userId: string): Promise<IVehicleAssignment> {
    try {
      return await prisma.vehicleAssignment.create({
        data: { vehicleId, userId },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error('Erro ao abrir atribuição', err);
      throw err;
    }
  }

  /** Fecha a atribuição aberta de um veículo (define endedAt = agora). */
  async closeOpen(vehicleId: string): Promise<void> {
    try {
      await prisma.vehicleAssignment.updateMany({
        where: { vehicleId, endedAt: null },
        data: { endedAt: new Date() },
      });
    } catch (err) {
      logger.error('Erro ao fechar atribuição', err);
      throw err;
    }
  }
}

export const assignmentsRepository = new AssignmentsRepository();
