// src/features/auth/services/auth.service.ts
import type { UserRole } from '@/shared/types/api';
import type { Access, Area } from '@/shared/lib/areas';
import { apiClient, tokenStorage } from '@/shared/lib/api-client';

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