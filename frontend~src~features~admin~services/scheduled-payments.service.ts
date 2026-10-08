// src/features/admin/services/scheduled-payments.service.ts
//
// Pagamentos que entram ou saem do saldo de um motorista, sozinhos, numa data.
//
// O que isto agenda não é um movimento — é a REGRA que fabrica movimentos.
// Quando chega a data, nasce um lançamento manual normal, com esta descrição e
// este sentido, e o motorista vê-o no extrato como vê qualquer outro.

import { apiClient } from '@/shared/lib/api-client';

export type AdjustmentType = 'CREDIT' | 'DEBIT';

export type PaymentFrequency =
  | 'UNICO' | 'SEMANAL' | 'QUINZENAL' | 'MENSAL'
  | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';

/** O rótulo de cada frequência, e a ordem em que aparecem no formulário. */
export const FREQUENCIAS: Array<{ valor: PaymentFrequency; rotulo: string }> = [
  { valor: 'UNICO', rotulo: 'Uma única vez' },
  { valor: 'SEMANAL', rotulo: 'Todas as semanas' },
  { valor: 'QUINZENAL', rotulo: 'De 15 em 15 dias' },
  { valor: 'MENSAL', rotulo: 'Todos os meses' },
  { valor: 'TRIMESTRAL', rotulo: 'De 3 em 3 meses' },
  { valor: 'SEMESTRAL', rotulo: 'De 6 em 6 meses' },
  { valor: 'ANUAL', rotulo: 'Todos os anos' },
];

export interface PaymentCategory {
  id: string;
  label: string;
  active: boolean;
}

export interface ScheduledPayment {
  id: string;
  userId: string;
  userName: string;
  type: AdjustmentType;
  amount: number;
  /** O que o motorista lê no extrato. */
  description: string;
  categoryId: string | null;
  categoryLabel: string | null;
  frequency: PaymentFrequency;
  startsOn: string;
  /** Nula quando já não há próxima — acabou ou foi desligado. */
  nextRunOn: string | null;
  endsOn: string | null;
  /** Quantos lançamentos ainda faltam. Nulo = sem limite. */
  remaining: number | null;
  active: boolean;
  runCount: number;
  lastRunAt: string | null;
}

export interface NovoAgendamento {
  userId: string;
  type: AdjustmentType;
  amount: number;
  description: string;
  categoryId?: string | null;
  frequency: PaymentFrequency;
  /** "YYYY-MM-DD" */
  startsOn: string;
  endsOn?: string | null;
  remaining?: number | null;
}

export const scheduledPaymentsService = {
  list(params: { userId?: string; active?: boolean } = {}): Promise<{ payments: ScheduledPayment[] }> {
    const q = new URLSearchParams();
    if (params.userId) q.set('userId', params.userId);
    if (params.active !== undefined) q.set('active', String(params.active));
    const s = q.toString();
    return apiClient.get(`/scheduled-payments${s ? `?${s}` : ''}`);
  },

  create(input: NovoAgendamento): Promise<{ payment: ScheduledPayment }> {
    return apiClient.post('/scheduled-payments', input);
  },

  /** Ligar e desligar. Ao religar, a próxima data salta para a primeira futura. */
  setActive(id: string, active: boolean): Promise<{ payment: ScheduledPayment }> {
    return apiClient.patch(`/scheduled-payments/${id}`, { active });
  },

  /** Apaga a REGRA. Os movimentos que ela já fez ficam — o saldo depende deles. */
  remove(id: string): Promise<{ deleted: boolean }> {
    return apiClient.delete(`/scheduled-payments/${id}`);
  },

  // ── Os tipos de pagamento, que são editáveis ────────────────────────────
  listCategories(todas = false): Promise<{ categories: PaymentCategory[] }> {
    return apiClient.get(`/scheduled-payments/categories${todas ? '?all=true' : ''}`);
  },

  createCategory(label: string): Promise<{ category: PaymentCategory }> {
    return apiClient.post('/scheduled-payments/categories', { label });
  },

  /** Desliga em vez de apagar: os agendamentos antigos ainda lhe apontam. */
  setCategoryActive(id: string, active: boolean): Promise<{ category: PaymentCategory }> {
    return apiClient.patch(`/scheduled-payments/categories/${id}`, { active });
  },
};
