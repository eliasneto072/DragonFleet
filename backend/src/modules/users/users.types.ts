import { UserRole, UserStatus } from '../../shared/types/enums';

export interface IUser {
  id: string;
  name: string;
  email: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
  role: UserRole;
  status: UserStatus;
  // relacionamentos removidos — cada módulo gere os seus próprios dados
}

export type IUserPublic = Omit<IUser, 'password'>;

export type Actor = {
  id: string;
  role?: UserRole;
};