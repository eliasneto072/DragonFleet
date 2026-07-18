import { IVehicle, IVehiclePublic } from './vehicles.types';
import { CreateVehicleData, UpdateVehicleData } from './vehicles.repository.types';

export interface IVehicleRepository {
  findAll(): Promise<IVehiclePublic[]>;
  findById(id: string): Promise<IVehiclePublic | null>;
  findByPlate(plate: string): Promise<IVehicle | null>;
  findByUserId(userId: string): Promise<IVehiclePublic[]>;
  create(data: CreateVehicleData): Promise<IVehiclePublic>;
  update(id: string, data: UpdateVehicleData): Promise<IVehiclePublic>;
  delete(id: string): Promise<void>;
}