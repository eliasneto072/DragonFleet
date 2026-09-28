// src/shared/services/investments.service.ts
//
// Investimentos: planos (admin) e aplicações (motorista e admin).
// Em `shared` porque as duas áreas o usam — o erro que já aconteceu com o
// withdrawalsService, alojado na feature do motorista e importado pelo
// Financeiro, não se repete aqui.

import { apiClient } from '@/shared/lib/api-client';
import type { Tier } from '@/shared/services/ranks.service';

export type PlanType = 'FIXED' | 'FLEXIBLE';
export type InvestmentStatus = 'ACTIVE' | 'CLOSED';
export type CloseReason = 'MATURED' | 'EARLY' | 'WITHDRAWN';

export interface InvestmentPlan {
  id: string;
  name: string;
  description: string | null;
  type: PlanType;
  /** Taxa anual em % em vigor hoje. */
  annualRate: number;
  termDays: number | null;
  earlyWithdrawalPenalty: number | null;
  minAmount: number;
  /** Nível mínimo para aplicar. Nulo = aberto a todos. */
  minRank: Tier | null;
  /** Só na lista do motorista: ele já tem o nível exigido? */
  unlocked?: boolean;
  active: boolean;
  createdAt: string;
  activeCount?: number;
  activePrincipal?: number;
}

export interface Investment {
  id: string;
  userId: string;
  userName?: string;
  planId: string;
  planName: string;
  planType: PlanType;
  principal: number;
  currentRate: number;
  termDays: number | null;
  penaltyRate: number | null;
  startDate: string;
  maturityDate: string | null;
  accruedThrough: string | null;
  gains: number;
  currentValue: number;
  dailyGain: number;
  status: InvestmentStatus;
  closeReason: CloseReason | null;
  payout: number | null;
  penaltyAmount: number | null;
  createdAt: string;
  closedAt: string | null;
}

export interface InvestmentTotals {
  invested: number;
  gains: number;
  currentValue: number;
  dailyGain: number;
  realizedGains: number;
}

export interface InvestmentEvent {
  kind: 'DEPOSIT' | 'GAIN' | 'REDEMPTION';
  date: string;
  amount: number;
  annualRate?: number;
  detail?: string;
}

export interface WithdrawPreview {
  reason: CloseReason;
  principal: number;
  gains: number;
  penalty: number;
  payout: number;
  today: string;
}

export interface RatePoint {
  id: string;
  annualRate: number;
  effectiveFrom: string;
  createdAt: string;
}

export interface PlanInput {
  name: string;
  description?: string | null;
  type: PlanType;
  annualRate: number;
  termDays?: number | null;
  earlyWithdrawalPenalty?: number | null;
  minAmount?: number;
  minRank?: Tier | null;
  active?: boolean;
}

export const investmentsService = {
  // Planos
  listPlans(all = false): Promise<{ plans: InvestmentPlan[] }> {
    return apiClient.get(`/investments/plans${all ? '?all=1' : ''}`);
  },
  createPlan(input: PlanInput): Promise<{ plan: InvestmentPlan }> {
    return apiClient.post('/investments/plans', input);
  },
  updatePlan(id: string, input: Partial<Omit<PlanInput, 'type'>>): Promise<{ plan: InvestmentPlan }> {
    return apiClient.patch(`/investments/plans/${id}`, input);
  },
  rateHistory(id: string): Promise<{ rates: RatePoint[] }> {
    return apiClient.get(`/investments/plans/${id}/rates`);
  },
  setRate(id: string, annualRate: number, effectiveFrom?: string): Promise<{ rates: RatePoint[] }> {
    return apiClient.post(`/investments/plans/${id}/rates`, { annualRate, effectiveFrom });
  },

  // Aplicações
  mine(): Promise<{ investments: Investment[]; totals: InvestmentTotals }> {
    return apiClient.get('/investments/me');
  },
  forUser(userId: string): Promise<{ investments: Investment[]; totals: InvestmentTotals }> {
    return apiClient.get(`/investments/user/${userId}`);
  },
  overview(filter: { status?: InvestmentStatus; planId?: string; search?: string } = {}): Promise<{
    investments: Investment[];
    truncated: boolean;
    totals: { activeCount: number; invested: number; gains: number; dailyGain: number };
  }> {
    const q = new URLSearchParams();
    if (filter.status) q.set('status', filter.status);
    if (filter.planId) q.set('planId', filter.planId);
    if (filter.search?.trim()) q.set('search', filter.search.trim());
    const qs = q.toString();
    return apiClient.get(`/investments/overview${qs ? `?${qs}` : ''}`);
  },
  subscribe(planId: string, amount: number): Promise<{ investment: Investment }> {
    return apiClient.post('/investments', { planId, amount });
  },
  detail(id: string): Promise<{ investment: Investment; events: InvestmentEvent[] }> {
    return apiClient.get(`/investments/${id}`);
  },
  previewWithdraw(id: string): Promise<{ preview: WithdrawPreview }> {
    return apiClient.get(`/investments/${id}/withdraw-preview`);
  },
  withdraw(id: string): Promise<{ investment: Investment }> {
    return apiClient.post(`/investments/${id}/withdraw`, {});
  },
};
