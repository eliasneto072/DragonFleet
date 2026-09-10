import { UserRole, UserStatus } from '../../shared/types/enums';

export type CreateUserData = {
  name: string;
  email: string;
  password: string; // já hasheada
  role: UserRole;
  status: UserStatus;
};

export type UpdateUserData = {
  name?: string;
  email?: string;
  /** `null` apaga o contacto — o campo e opcional e tem de dar para o limpar. */
  phone?: string | null;
  password?: string; // já hasheada se vier
  role?: UserRole;
  status?: UserStatus;
};