import { VehicleStatus } from '../../shared/types/enums';

export type CreateVehicleData = {
  brand: string;
  model: string;
  plate: string;
  year: number;
  status: VehicleStatus;
  userId: string;
};

export type UpdateVehicleData = {
  brand?: string;
  model?: string;
  plate?: string;
  year?: number;
  status?: VehicleStatus;
};

// Aliases para compatibilidade com interface e service
export type ICreateVehicleRepositoryDTO = CreateVehicleData;
export type IUpdateVehicleRepositoryDTO = UpdateVehicleData;
export type IFindVehicleRepositoryFilters = {
  userId?: string;
  status?: VehicleStatus;
};