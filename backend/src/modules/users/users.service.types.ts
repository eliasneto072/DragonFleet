import { UserRole, UserStatus } from '../../shared/types/enums';

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  status?: UserStatus;
};

export type UpdateUserInput = {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  status?: UserStatus;
};