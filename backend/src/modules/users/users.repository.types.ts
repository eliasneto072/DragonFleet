import { UserRole, UserStatus } from '../../shared/types/enums';

export type CreateUserData = {
  /**
   * A frota onde a conta nasce.
   *
   * Escrita à mão e não deixada à camada do âmbito (`escopo.ts`) de propósito:
   * o registo público corre ANTES de haver frota definida — ninguém está
   * autenticado ainda — e por isso é quem chama que tem de a resolver.
   */
  fleetId: string;
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
  /** "Este motorista é a empresa." Só o administrador. */
  isCompany?: boolean;
};