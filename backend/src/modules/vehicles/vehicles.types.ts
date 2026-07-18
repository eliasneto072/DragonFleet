import { VehicleStatus } from '../../shared/types/enums';
import { IUserPublic } from '../users/users.types';

export interface IVehicle {
  id: string;
  brand: string;
  model: string;
  plate: string;
  year: number;

  status: VehicleStatus;
  
  userId: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export type IVehiclePublic = IVehicle;

export type IVehicleWithUser = IVehicle & {
  user?: IUserPublic;
};