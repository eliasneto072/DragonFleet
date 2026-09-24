// src/shared/services/permissions.service.ts
//
// Permissões por pessoa e por área do painel.

import { apiClient } from '@/shared/lib/api-client';
import type { Access, Area } from '@/shared/lib/areas';
import type { UserRole } from '@/shared/types/api';

export type Grants = Record<Area, Access>;

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  /** Falso = nunca configurado; vale o comportamento antigo do papel. */
  configured: boolean;
  areasCount: number;
  manageCount: number;
}

export interface Profile {
  id: string;
  nome: string;
  descricao: string;
  acessos: Partial<Grants>;
}

export interface PermissionsOf {
  user: { id: string; name: string; email: string; role: UserRole };
  configured: boolean;
  grants: Grants;
}

export const permissionsService = {
  catalog: () => apiClient.get<{
    areas: { id: Area; name: string }[];
    groups: { titulo: string; areas: Area[] }[];
    profiles: Profile[];
  }>('/permissions/catalog'),

  mine: () => apiClient.get<{ grants: Grants }>('/permissions/mine'),

  listStaff: () => apiClient.get<{ staff: StaffRow[] }>('/permissions/staff'),

  get: (userId: string) => apiClient.get<PermissionsOf>(`/permissions/${userId}`),

  set: (userId: string, grants: Partial<Grants>) =>
    apiClient.put<PermissionsOf>(`/permissions/${userId}`, { grants }),

  /** Volta ao comportamento antigo do papel. */
  reset: (userId: string) => apiClient.delete<PermissionsOf>(`/permissions/${userId}`),
};
