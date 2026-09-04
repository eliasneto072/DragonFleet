// src/features/auth/services/auth.service.ts
import type { UserRole } from '@/shared/types/api';
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