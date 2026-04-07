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