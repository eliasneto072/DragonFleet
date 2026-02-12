// src/models/interfaces/IEarning.ts
import { IUser } from "./IUser";

export interface IEarning {
  id: string;
  amount: number;   
  date: Date;
  platform: string;

  userId: string;
  createdAt: Date;

  user?: IUser;
}
