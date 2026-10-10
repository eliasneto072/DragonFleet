// src/features/auth/services/auth.service.ts
import type { UserRole } from '@/shared/types/api';
import type { Access, Area } from '@/shared/lib/areas';
import { apiClient, tokenStorage } from '@/shared/lib/api-client';

/**
 * A frota desta sessão: o que comprou, e se ainda pode escrever.
 *
 * Vem com o utilizador no login e no /auth/me, pela mesma razão das
 * permissões: o menu precisa disto para saber o que desenhar, e num segundo
 * pedido havia um instante a mostrar menus que a frota não comprou.
 *
 * Nada disto autoriza coisa nenhuma. Quem decide é o servidor, que lê o plano
 * da base de dados a cada pedido — mexer nisto no browser dá um menu bonito
 * que responde 403.
 */
export interface FrotaDaSessao {
  id: string;
  nome: string;
  slug: string;
  /** A frota da casa, e não a de um cliente. */
  daCasa: boolean;
  /** Os códigos das funcionalidades que o plano inclui. */
  funcionalidades: string[];
  /** `false` com a assinatura expirada: lê-se tudo, não se escreve nada. */
  podeEscrever: boolean;
  assinatura: { estado: string; dias: number | null };
  /** Último dia pago. `null` sem assinatura — é o caso da casa. */
  terminaEm: string | null;
}

export interface AuthUser {
  id:        string;
  name:      string;
  email:     string;
  // Importado, e não repetido.
  //
  // Esta linha era uma segunda cópia da união de papéis, e ficou para trás
  // quando o SUPPORT entrou no api.ts. O sintoma foi um erro de tipos a dizer
  // que comparar o papel com 'SUPPORT' não fazia sentido — em duas telas que
  // liam o utilizador daqui e não de lá.
  role:      UserRole;
  status:    string;
  createdAt: string;
  updatedAt: string;

  /**
   * O que esta pessoa pode fazer em cada área do painel.
   *
   * Vem no /auth/me e não num pedido à parte: o menu precisa dela para saber
   * o que desenhar, e num segundo pedido haveria um instante com o menu já
   * desenhado sem ela — a piscar entradas que a pessoa não pode abrir.
   *
   * Ausente nas respostas antigas em cache; quem lê trata isso como "sem
   * permissões configuradas" e cai no papel.
   */
  permissions?: Partial<Record<Area, Access>>;

  /**
   * É o dono da PLATAFORMA, e não o administrador de uma frota.
   *
   * É isto que desenha o botão que troca para o painel de sistema. Opcional
   * porque as respostas antigas em cache não o trazem, e nesse caso a resposta
   * certa é "não é" — o botão não aparece, e nada mais muda.
   *
   * Não dá acesso a nada: quem decide é a guarda do servidor, que lê a mesma
   * marca da base de dados a cada pedido. Mudar isto no browser dá um botão
   * que leva a um painel que responde 403.
   */
  isOwner?: boolean;

  /**
   * A frota desta sessão. Ausente nas respostas antigas em cache — quem lê
   * trata isso como "sem restrições", que é o que era verdade antes dos
   * planos existirem.
   */
  frota?: FrotaDaSessao | null;
}

interface LoginResponse {
  token:        string;
  refreshToken: string;
  user:         AuthUser;
}

export const authService = {
  async login(email: string, password: string): Promise<AuthUser> {
    const res = await apiClient.post<LoginResponse>('/auth/login', { email, password });
    tokenStorage.setAccess(res.token);
    tokenStorage.setRefresh(res.refreshToken);
    return res.user;
  },

  async logout(): Promise<void> {
    try { await apiClient.post('/auth/logout', {}); } catch { /* ignora */ }
    tokenStorage.clearAll();
  },

  async me(): Promise<AuthUser> {
    const res = await apiClient.get<{ user: AuthUser }>('/auth/me');
    return res.user;
  },

  getToken: () => tokenStorage.getAccess(),
};