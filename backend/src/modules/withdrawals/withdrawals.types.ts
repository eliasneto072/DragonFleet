import { WithdrawalStatus } from '../../shared/types/enums';
import { IUserPublic } from '../users/users.types';

export interface IWithdrawal {
  id: string;
  amount: number;
  status: WithdrawalStatus;
  notes?: string | null;
  requestedAt: Date;
  processedAt?: Date | null;
  userId: string;

  /** Recibo verde, anexado no momento do pedido. */
  receiptUrl: string;
  receiptKey: string;

  /**
   * IBAN de destino, copiado na APROVAÇÃO.
   *
   * Congelado de propósito: se o motorista alterar os dados bancários depois,
   * uma transferência já decidida não pode mudar de destino sem ninguém
   * reparar. Mesma lógica da percentagem no fecho semanal.
   */
  paidToIban?: string | null;
  paidToHolder?: string | null;

  /**
   * Qual das contas bancárias o motorista escolheu ao pedir.
   *
   * Nula nas retiradas anteriores a haver mais do que uma conta. O nome vem
   * junto para a tela do administrador poder dizer "Millennium" em vez de
   * mostrar vinte e cinco dígitos — e para ele saber que foi uma ESCOLHA e
   * não o IBAN por omissão.
   */
  bankAccountId?: string | null;
  bankAccountLabel?: string | null;

  /**
   * A quem foi emitido o recibo verde. Registado na aprovação.
   *
   * Quatro estados, e a diferença entre os dois últimos importa:
   *   companyId preenchido                → uma sociedade da lista
   *   companyOther preenchido             → outra, escrita à mão
   *   ambos nulos, companySetAt NÃO nulo  → "Nenhum", escolha deliberada
   *   ambos nulos, companySetAt nulo      → por classificar
   */
  companyId?: string | null;
  companyName?: string | null;
  companyOther?: string | null;
  companySetById?: string | null;
  companySetAt?: Date | null;
}

export type IWithdrawalPublic = IWithdrawal;

export type IWithdrawalWithUser = IWithdrawal & {
  user?: IUserPublic;
};
