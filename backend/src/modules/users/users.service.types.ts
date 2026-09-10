import { UserRole, UserStatus } from '../../shared/types/enums';

// Registo público: o papel e o estado são fixados no service, nunca vêm do
// corpo do pedido. Ver a nota em users.service.create.
export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
};

export type UpdateUserInput = {
  name?: string;
  email?: string;
  password?: string;
  /**
   * Contacto telefonico, ja normalizado pelo schema. `null` apaga-o.
   *
   * O `| null` nao e decorativo: sem ele, `phone: null` era recusado pelo
   * compilador e o motorista ficava sem forma de remover o numero.
   */
  phone?: string | null;
  /**
   * Palavra-passe atual, para reautenticação. Exigida quando o próprio
   * utilizador altera a palavra-passe ou o email — ter o token não deve ser
   * suficiente para tomar a conta. Não é exigida quando um administrador
   * altera o registo de outra pessoa, senão a reposição administrativa
   * deixaria de funcionar.
   */
  currentPassword?: string;
  role?: UserRole;
  status?: UserStatus;
};
