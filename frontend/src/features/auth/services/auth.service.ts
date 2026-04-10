// src/features/auth/services/auth.service.ts

import { apiClient } from '@/shared/lib/api-client';

// ---------- tipos que espelham o contrato do backend ----------

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'DRIVER' | 'MANAGER';
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  createdAt: string;
  updatedAt: string;
}

interface LoginResponse {
  token: string;
  user: AuthUser;
}

interface MeResponse {
  user: AuthUser;
}

// ---------- service ----------

export const authService = {
  /**
   * POST /auth/login
   * Faz login, persiste o token e retorna o usuário.
   */
  async login(email: string, password: string): Promise<AuthUser> {
    const data = await apiClient.post<LoginResponse>('/auth/login', {
      email,
      password,
    });

    localStorage.setItem('dragonfleet:token', data.token);
    return data.user;
  },

  /**
   * POST /auth/logout
   * Avisa o backend (stateless) e limpa o token local.
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout', {});
    } finally {
      localStorage.removeItem('dragonfleet:token');
    }
  },

  /**
   * GET /auth/me
   * Retorna o usuário autenticado com base no token salvo.
   */
  async me(): Promise<AuthUser> {
    const data = await apiClient.get<MeResponse>('/auth/me');
    return data.user;
  },

  /** Lê o token salvo no localStorage. */
  getToken(): string | null {
    return localStorage.getItem('dragonfleet:token');
  },
};