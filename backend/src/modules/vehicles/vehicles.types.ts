import { VehicleStatus } from '../../shared/types/enums';
import { IUserPublic } from '../users/users.types';

export interface IVehicle {
  id: string;
  brand: string;
  model: string;
  plate: string;
  year: number;
  vin: string | null;

  status: VehicleStatus;
  activationForced: boolean;

  /**
   * Encargo semanal da viatura. Preenche o campo "Viatura" no fecho semanal
   * como valor sugerido — o fecho grava a sua própria cópia, para que alterar
   * isto não reescreva semanas já pagas.
   */
  weeklyFee: number;

  userId: string | null; // pode ser null (veículo não atribuído)

  createdAt: Date;
  updatedAt: Date;
}

export type IVehiclePublic = IVehicle;

export type IVehicleWithUser = IVehicle & {
  user?: IUserPublic | null;
};

// Registo de atribuição (histórico)
export interface IVehicleAssignment {
  id: string;
  vehicleId: string;
  userId: string | null;
  startedAt: Date;
  endedAt: Date | null;
}

export type IVehicleAssignmentWithUser = IVehicleAssignment & {
  user?: IUserPublic | null;
};

/** O mesmo histórico visto do lado do motorista: que carros ele conduziu. */
export type IVehicleAssignmentWithVehicle = IVehicleAssignment & {
  vehicle?: {
    id: string;
    brand: string;
    model: string;
    plate: string;
    year: number;
    status: string;
  } | null;
};