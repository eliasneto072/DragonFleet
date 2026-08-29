// src/features/driver/services/vehicles.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { ApiVehicle, ApiVehicleAssignment, ApiDriverAssignment, VehicleStatus } from '@/shared/types/api';

interface CreateVehicleInput {
  brand:   string;
  model:   string;
  plate:   string;
  year:    number;
  vin?:    string;
  status?: VehicleStatus;
  /** Encargo semanal. Só a gestão o define — o servidor recusa aos restantes. */
  weeklyFee?: number;
}

interface UpdateVehicleInput {
  brand?:  string;
  model?:  string;
  plate?:  string;
  year?:   number;
  vin?:    string;
  status?: VehicleStatus;  // apenas admin/manager pode alterar
  weeklyFee?: number;      // idem — devolve CANNOT_CHANGE_VEHICLE_FEE ao motorista
}

export const vehiclesService = {
  /** GET /vehicles — lista do utilizador com sessão iniciada (ou todos, se admin) */
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

  // ── Atribuição (admin/manager) ──────────────────────────────────────────
  /** POST /vehicles/:id/assign */
  assign(id: string, userId: string): Promise<{ vehicle: ApiVehicle }> {
    return apiClient.post(`/vehicles/${id}/assign`, { userId });
  },

  /** POST /vehicles/:id/unassign */
  unassign(id: string): Promise<{ vehicle: ApiVehicle }> {
    return apiClient.post(`/vehicles/${id}/unassign`, {});
  },

  /** GET /vehicles/:id/assignments */
  assignmentHistory(id: string): Promise<{ history: ApiVehicleAssignment[] }> {
    return apiClient.get(`/vehicles/${id}/assignments`);
  },

  /**
   * GET /vehicles/driver/:userId/assignments — que carros esta pessoa conduziu.
   *
   * O inverso de assignmentHistory: mesma tabela, outro ângulo. A ficha do
   * motorista precisa deste; a do veículo, do outro.
   */
  driverVehicleHistory(userId: string): Promise<{ history: ApiDriverAssignment[] }> {
    return apiClient.get(`/vehicles/driver/${userId}/assignments`);
  },

  // ── Ativação híbrida (admin/manager) ────────────────────────────────────
  /** POST /vehicles/:id/force-activation */
  forceActivation(id: string, forced: boolean): Promise<{ vehicle: ApiVehicle }> {
    return apiClient.post(`/vehicles/${id}/force-activation`, { forced });
  },
};