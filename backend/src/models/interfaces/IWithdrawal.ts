// src/models/interfaces/IWithdrawal.ts
import { IUser } from "./IUser";
import { WithdrawalStatus } from "../enums/enums";

export interface IWithdrawal {
  id: string;
  amount: number;
  status: WithdrawalStatus;
  requestedAt: Date;

  userId: string;
  user?: IUser;
}
