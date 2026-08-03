import { VehicleStatus } from '../../shared/types/enums';

export type CreateVehicleData = {
  brand: string;
  model: string;
  plate: string;
  year: number;
  vin?: string | null;
  status: VehicleStatus;
  weeklyFee?: number;
  userId?: string | null; // opcional — veículo pode nascer não atribuído
};

export type UpdateVehicleData = {
  brand?: string;
  model?: string;
  plate?: string;
  year?: number;
  vin?: string | null;
  status?: VehicleStatus;
  activationForced?: boolean;
  weeklyFee?: number;
  userId?: string | null;
};

// Aliases para compatibilidade com interface e service
export type ICreateVehicleRepositoryDTO = CreateVehicleData;
export type IUpdateVehicleRepositoryDTO = UpdateVehicleData;
export type IFindVehicleRepositoryFilters = {
  userId?: string;
  status?: VehicleStatus;
};
