// src/features/admin/services/users.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { ApiUser, UserRole, UserStatus } from '@/shared/types/api';

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
  /** GET /users — apenas admin */
  list(): Promise<{ users: ApiUser[] }> {
    return apiClient.get('/users');
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
