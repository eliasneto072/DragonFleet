// src/features/admin/services/users.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { ApiUser, UserRole, UserStatus } from '@/shared/types/api';

interface CreateUserInput {
  name:     string;
  email:    string;
  password: string;
  role?:    UserRole;
  status?:  UserStatus;
}

interface UpdateUserInput {
  name?:     string;
  email?:    string;
  password?: string;
  role?:     UserRole;
  status?:   UserStatus;
}

export const usersService = {
  /** GET /users — apenas admin/manager */
  list(): Promise<{ users: ApiUser[] }> {
    return apiClient.get('/users');
  },

  /** GET /users/:id */
  getById(id: string): Promise<{ user: ApiUser }> {
    return apiClient.get(`/users/${id}`);
  },

  /**
   * POST /users — rota pública (sem token).
   * Usada para cadastro de novos motoristas.
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