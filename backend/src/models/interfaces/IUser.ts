// src/models/interfaces/IUser.ts
import { UserRole, UserStatus } from "../enums/enums";
import { IEarning } from "./IEarning";
import { IVehicle } from "./IVehicle";
import { INotification } from "./INotification";
import { IDocument } from "./IDocument";
import { IWithdrawal } from "./IWithdrawal";

export interface IUser {
  id: string;
  name: string;
  email: string;
  password: string;

  role: UserRole;
  status: UserStatus;

  createdAt: Date;
  updatedAt: Date;

  // Relacionamentos (0..N)
  earnings?: IEarning[];
  vehicles?: IVehicle[];
  notifications?: INotification[];
  documents?: IDocument[];
  withdrawals?: IWithdrawal[];
}
