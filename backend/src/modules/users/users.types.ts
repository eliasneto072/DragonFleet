import { UserRole, UserStatus } from '../../shared/types/enums';

export interface IUser {
  id: string;
  name: string;
  email: string;
  password: string;
  /** Contacto opcional, normalizado. `null` quando nunca foi preenchido. */
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
  role: UserRole;
  status: UserStatus;
  /**
   * Este utilizador É a empresa (o dono, que também conduz).
   *
   * Muda como as estatísticas contam os fechos dele: o aluguer da viatura não
   * entra no lucro (é a empresa a cobrar a si própria) e o líquido da semana
   * entra por inteiro.
   */
  isCompany: boolean;
  // relacionamentos removidos — cada módulo gere os seus próprios dados
}

export type IUserPublic = Omit<IUser, 'password'>;

export type Actor = {
  id: string;
  role?: UserRole;
};