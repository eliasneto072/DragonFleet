// src/models/interfaces/IVehicle.ts
import { IUser } from "./IUser";

export interface IVehicle {
  id: string;
  plate: string;
  model: string;
  year: number;

  userId: string;
  user?: IUser;
}
