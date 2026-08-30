// src/features/admin/services/users.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { ApiUser, UserRole, UserStatus } from '@/shared/types/api';
import type { PageInfo } from '@/app/components/ui/list-toolbar';

// O registo público não aceita papel nem estado: o backend fixa DRIVER/ACTIVE.
// Enviá-los agora resulta em erro de validação, e é isso que se pretende.
interface CreateUserInput {
  name:     string;
  email:    string;
  password: string;
}

interface UpdateUserInput {
  name?:     string;
  email?:    string;
  password?: string;
  /**
   * Obrigatório quando o próprio utilizador altera a palavra-passe ou o email.
   * O backend responde CURRENT_PASSWORD_REQUIRED se faltar e
   * INVALID_CURRENT_PASSWORD se não bater.
   */
  currentPassword?: string;
  role?:     UserRole;
  status?:   UserStatus;
}

export const usersService = {
  /**
   * GET /users — uma PÁGINA, com pesquisa e filtros aplicados no servidor.
   *
   * A pesquisa era feita no browser sobre os 2000 descarregados. Assim que a
   * lista passa a paginar, isso fica errado de uma maneira silenciosa:
   * procurar "Mónica" passaria a procurar dentro dos 25 da página atual, e a
   * tela responderia "sem resultados" com a pessoa a existir mais à frente.
   *
   * Os `counts` são da frota INTEIRA, não da página: os cartões do topo dizem
   * quantos estão ativos e bloqueados, e contá-los a partir da página faria
   * esses números mudar conforme se navega.
   */
  list(params: {
    search?: string; status?: string; role?: string;
    pending?: string; sort?: string;
    page?: number; pageSize?: number;
  } = {}): Promise<{
    users: ApiUser[];
    page: PageInfo;
    counts: Record<string, number>;
  }> {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.status) q.set('status', params.status);
    if (params.role) q.set('role', params.role);
    if (params.pending) q.set('pending', params.pending);
    if (params.sort) q.set('sort', params.sort);
    if (params.page && params.page > 1) q.set('page', String(params.page));
    if (params.pageSize) q.set('pageSize', String(params.pageSize));
    const qs = q.toString();
    return apiClient.get(`/users${qs ? `?${qs}` : ''}`);
  },

  /**
   * GET /users/all — todos, sem paginar.
   *
   * Só para quem precisa mesmo da lista inteira: o seletor de motorista de um
   * formulário, por exemplo. As TELAS devem usar o list() — foi por não haver
   * esta distinção que a de Motoristas acabou a descarregar 2000 registos.
   */
  listAll(): Promise<{ users: ApiUser[] }> {
    return apiClient.get('/users/all');
  },

  /** GET /users/:id */
  getById(id: string): Promise<{ user: ApiUser }> {
    return apiClient.get(`/users/${id}`);
  },

  /**
   * POST /users — rota pública (sem token).
   * Usada para cadastro de novos motoristas. Cria sempre com papel DRIVER.
   */
  create(input: CreateUserInput): Promise<{ user: ApiUser }> {
    return apiClient.post('/users', input);
  },

  /** PATCH /users/:id */
  update(id: string, input: UpdateUserInput): Promise<{ user: ApiUser }> {
    return apiClient.patch(`/users/${id}`, input);
  },

  /** DELETE /users/:id — apenas admin */
  remove(id: string): Promise<void> {
    return apiClient.delete(`/users/${id}`);
  },
};
