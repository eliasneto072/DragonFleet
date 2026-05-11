// src/features/driver/services/vehicles.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { ApiVehicle, VehicleStatus } from '@/shared/types/api';

interface CreateVehicleInput {
  brand:   string;
  model:   string;
  plate:   string;
  year:    number;
  status?: VehicleStatus;
}

interface UpdateVehicleInput {
  brand?:  string;
  model?:  string;
  plate?:  string;
  year?:   number;
  status?: VehicleStatus;  // apenas admin/manager pode alterar
}

export const vehiclesService = {
  /** GET /vehicles — lista do usuário logado (ou todos, se admin) */
  list(): Promise<{ vehicles: ApiVehicle[] }> {
    return apiClient.get('/vehicles');
  },

  /** GET /vehicles/user/:userId */
  listByUser(userId: string): Promise<{ vehicles: ApiVehicle[] }> {
    return apiClient.get(`/vehicles/user/${userId}`);
  },

  /** GET /vehicles/:id */
  getById(id: string): Promise<{ vehicle: ApiVehicle }> {
    return apiClient.get(`/vehicles/${id}`);
  },

  /** POST /vehicles */
  create(input: CreateVehicleInput): Promise<{ vehicle: ApiVehicle }> {
    return apiClient.post('/vehicles', input);
  },

  /** PATCH /vehicles/:id */
  update(id: string, input: UpdateVehicleInput): Promise<{ vehicle: ApiVehicle }> {
    return apiClient.patch(`/vehicles/${id}`, input);
  },

  /** DELETE /vehicles/:id */
  remove(id: string): Promise<void> {
    return apiClient.delete(`/vehicles/${id}`);
  },
};