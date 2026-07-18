// src/features/driver/services/earnings.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { ApiEarning, EarningPlatform } from '@/shared/types/api';

interface CreateEarningInput {
  amount:   number;
  date:     string;       // ISO 8601 — ex: "2026-04-10"
  platform: EarningPlatform;
  userId?:  string;       // só admins precisam passar; drivers usam o próprio id
}

interface UpdateEarningInput {
  amount?:   number;
  date?:     string;
  platform?: EarningPlatform;
}

export const earningsService = {
  /** GET /earnings — lista do usuário logado (ou todos, se admin) */
  list(): Promise<{ earnings: ApiEarning[] }> {
    return apiClient.get('/earnings');
  },

  /** GET /earnings/user/:userId */
  listByUser(userId: string): Promise<{ earnings: ApiEarning[] }> {
    return apiClient.get(`/earnings/user/${userId}`);
  },

  /** GET /earnings/:id */
  getById(id: string): Promise<{ earning: ApiEarning }> {
    return apiClient.get(`/earnings/${id}`);
  },

  /** POST /earnings */
  create(input: CreateEarningInput): Promise<{ earning: ApiEarning }> {
    return apiClient.post('/earnings', input);
  },

  /** PATCH /earnings/:id */
  update(id: string, input: UpdateEarningInput): Promise<{ earning: ApiEarning }> {
    return apiClient.patch(`/earnings/${id}`, input);
  },

  /** DELETE /earnings/:id */
  remove(id: string): Promise<void> {
    return apiClient.delete(`/earnings/${id}`);
  },
};