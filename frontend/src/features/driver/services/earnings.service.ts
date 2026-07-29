// src/features/driver/services/earnings.service.ts
//
// Lançamentos comunicados pelo motorista.
//
// NENHUM destes endpoints movimenta saldo. O dinheiro entra por uma porta só —
// o fecho semanal, em features/admin/services/settlements.service.
//
// A comunicação nasce pendente e espera avaliação da administração: aprovada
// significa "confere com o que vou fechar"; recusada, "não bate, e o motivo é
// este".

import { apiClient } from '@/shared/lib/api-client';
import type { ApiEarning, EarningPlatform, EarningStatus } from '@/shared/types/api';

interface CreateEarningInput {
  amount:   number;
  date:     string;       // ISO 8601 — ex: "2026-04-10"
  platform: EarningPlatform;
  /** Justificação: por que este valor está em falta. */
  notes?:   string | null;
  userId?:  string;       // só admins precisam passar; drivers usam o próprio id
}

interface UpdateEarningInput {
  amount?:   number;
  date?:     string;
  platform?: EarningPlatform;
  notes?:    string | null;
}

interface ListEarningsParams {
  userId?: string;
  status?: EarningStatus;
  /** "YYYY-MM-DD" */
  from?:   string;
  to?:     string;
}

interface ReviewEarningInput {
  status: Extract<EarningStatus, 'APPROVED' | 'REJECTED'>;
  /** Obrigatório ao recusar — o motorista vê este texto. */
  notes?: string | null;
}

function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const earningsService = {
  /** GET /earnings — do próprio utilizador, ou de todos se for gestão. */
  list(params: ListEarningsParams = {}): Promise<{ earnings: ApiEarning[] }> {
    return apiClient.get(`/earnings${query(params as Record<string, string | undefined>)}`);
  },

  /** GET /earnings/user/:userId */
  listByUser(userId: string): Promise<{ earnings: ApiEarning[] }> {
    return apiClient.get(`/earnings/user/${userId}`);
  },

  /** GET /earnings/:id */
  getById(id: string): Promise<{ earning: ApiEarning }> {
    return apiClient.get(`/earnings/${id}`);
  },

  /** POST /earnings — nasce pendente quando é o motorista a comunicar. */
  create(input: CreateEarningInput): Promise<{ earning: ApiEarning }> {
    return apiClient.post('/earnings', input);
  },

  /** PATCH /earnings/:id — o motorista só edita enquanto pendente. */
  update(id: string, input: UpdateEarningInput): Promise<{ earning: ApiEarning }> {
    return apiClient.patch(`/earnings/${id}`, input);
  },

  /** PATCH /earnings/:id/review — aprovar ou recusar. Apenas gestão. */
  review(id: string, input: ReviewEarningInput): Promise<{ earning: ApiEarning }> {
    return apiClient.patch(`/earnings/${id}/review`, input);
  },

  /** DELETE /earnings/:id — o motorista só apaga enquanto pendente. */
  remove(id: string): Promise<void> {
    return apiClient.delete(`/earnings/${id}`);
  },
};
