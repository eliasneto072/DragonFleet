import { UserRole, UserStatus } from '../../shared/types/enums';

export interface IUser {
  id: string;
  /**
   * A frota a que esta conta pertence.
   *
   * No tipo público porque o painel precisa de saber de que frota é a sessão —
   * é por ela que se descobre o plano, o nome a mostrar e o estado da
   * assinatura. É um id opaco da frota da própria pessoa: não abre nada que
   * ela já não possa ver.
   */
  fleetId: string;
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
  /**
   * É o dono da PLATAFORMA, e não de uma frota.
   *
   * Vem no tipo público porque é o painel que precisa dela: é esta marca que
   * desenha o botão que troca entre o painel de sistema e o da frota. Sem ela
   * na resposta do login, o botão só podia aparecer depois de um segundo
   * pedido — e piscava.
   *
   * Não dá acessos a ninguém por si só: quem decide é a guarda do servidor
   * (`dono.middleware.ts`), que a lê da base de dados a cada pedido.
   */
  isOwner: boolean;
  // relacionamentos removidos — cada módulo gere os seus próprios dados
}

export type IUserPublic = Omit<IUser, 'password'>;

export type Actor = {
  id: string;
  role?: UserRole;
};