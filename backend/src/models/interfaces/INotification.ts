// src/models/interfaces/INotification.ts
import { IUser } from "./IUser";

export interface INotification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;

  userId: string;
  user?: IUser;
}
