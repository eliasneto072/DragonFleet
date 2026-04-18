// src/features/auth/services/auth.service.ts

import { apiClient } from '@/shared/lib/api-client';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'DRIVER' | 'MANAGER';
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  createdAt: string;
  updatedAt: string;
}

export const authService = {
  async login(email: string, password: string): Promise<AuthUser> {
    const data = await apiClient.post<{ token: string; user: AuthUser }>('/auth/login', {
      email,
      password,
    });

    localStorage.setItem('dragonfleet:token', data.token);
    return data.user;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout', {});
    } finally {
      localStorage.removeItem('dragonfleet:token');
    }
  },

  async me(): Promise<AuthUser> {
    const data = await apiClient.get<{ user: AuthUser }>('/auth/me');
    return data.user;
  },

  getToken(): string | null {
    return localStorage.getItem('dragonfleet:token');
  },
};