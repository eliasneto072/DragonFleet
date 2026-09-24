// src/shared/services/investors.service.ts
//
// O portal do investidor e a tela de Investidores da administração falam com a
// mesma API. Um ficheiro só, para as formas dos dados não divergirem entre as
// duas telas — que é exatamente o que acontece quando cada uma declara os seus
// próprios tipos.

import { apiClient } from '@/shared/lib/api-client';

export type Bucket = 'CAPITAL' | 'EARNINGS';
export type MovementKind = 'DEPOSIT' | 'ACCRUAL' | 'WITHDRAWAL' | 'ADJUSTMENT';
export type WithdrawalStatus = 'PENDING' | 'PAID' | 'REJECTED';

export interface InvestorBalance {
  accountId: string;
  userId: string;
  userName: string;
  userEmail: string;
  accountStatus: 'ACTIVE' | 'CLOSED';
  startDate: string;
  accruedThrough: string | null;
  noticeDays: number;
  capital: number;
  earnings: number;
  total: number;
  pendingCapital: number;
  pendingEarnings: number;
  availableCapital: number;
  availableEarnings: number;
  deposited: number;
  withdrawn: number;
  /** Capital aplicado em projetos abertos. Já descontado do disponível. */
  investedInProjects: number;
  projectsCount: number;
}

export interface InvestorMovement {
  id: string;
  day: string;
  kind: MovementKind;
  bucket: Bucket;
  amount: number;
  description: string | null;
  createdAt: string;
}

export interface InvestorWithdrawal {
  id: string;
  bucket: Bucket;
  amount: number;
  status: WithdrawalStatus;
  availableOn: string;
  note: string | null;
  decision: string | null;
  createdAt: string;
  decidedAt: string | null;
  /** Só na fila da administração. */
  accountId?: string;
  investor?: { id: string; name: string; email: string };
}

export interface InvestorMe {
  account: {
    id: string;
    status: 'ACTIVE' | 'CLOSED';
    startDate: string;
    noticeDays: number;
    annualRate: number;
  };
  balance: InvestorBalance;
  projection: { day: number; month: number; year: number };
  pendingWithdrawals: InvestorWithdrawal[];
  recentMovements: InvestorMovement[];
}

export interface InvestorAccountDetail {
  account: {
    id: string;
    status: 'ACTIVE' | 'CLOSED';
    startDate: string;
    accruedThrough: string | null;
    noticeDays: number;
    notes: string | null;
    user: { id: string; name: string; email: string; phone: string | null; status: string };
    rates: { id: string; effectiveFrom: string; annualRate: number }[];
  };
  balance: InvestorBalance;
  movements: InvestorMovement[];
  withdrawals: InvestorWithdrawal[];
}

export interface InvestorOverview {
  investors: {
    accounts: number; capital: number; earnings: number; total: number; pending: number;
  };
  driversOwed: number;
  totalLiability: number;
}

export interface InvestorStats {
  oldest: { name: string; email: string; since: string; total: number } | null;
  topCapital: { name: string; email: string; capital: number } | null;
  topEarnings: { name: string; email: string; earned: number } | null;
  /** Juros pagos aos depósitos — um custo, não um lucro. */
  interestPaid: number;
  projects: { profit: number; toInvestors: number; toCompany: number };
}

export interface InvestorNotification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const investorsService = {
  // ── Portal ────────────────────────────────────────────────────────────────

  me: () => apiClient.get<InvestorMe>('/investors/me'),

  statement: (params: {
    accountId?: string; from?: string; to?: string;
    kind?: MovementKind; page?: number; pageSize?: number;
  } = {}) =>
    apiClient.get<{
      total: number; page: number; pageSize: number; movements: InvestorMovement[];
    }>(`/investors/statement${qs(params)}`),

  monthly: (accountId?: string) =>
    apiClient.get<{ months: { month: string; amount: number }[] }>(
      `/investors/monthly${qs({ accountId })}`,
    ),

  myWithdrawals: (accountId?: string) =>
    apiClient.get<{ withdrawals: InvestorWithdrawal[] }>(
      `/investors/withdrawals${qs({ accountId })}`,
    ),

  requestWithdrawal: (body: { bucket: Bucket; amount: number; note?: string }) =>
    apiClient.post<{ withdrawal: InvestorWithdrawal }>('/investors/withdrawals', body),

  cancelWithdrawal: (id: string) =>
    apiClient.delete<{ ok: boolean }>(`/investors/withdrawals/${id}`),

  notifications: () =>
    apiClient.get<{ notifications: InvestorNotification[] }>('/investors/notifications'),

  readNotification: (id: string) =>
    apiClient.patch<{ ok: boolean }>(`/investors/notifications/${id}/read`, {}),

  // ── Administração ─────────────────────────────────────────────────────────

  listAccounts: (params: {
    search?: string;
    status?: 'ACTIVE' | 'CLOSED';
    /** total | capital | earnings | oldest | name */
    sort?: string;
  } = {}) =>
    apiClient.get<{ accounts: (InvestorBalance & { annualRate: number })[] }>(
      `/investors/accounts${qs(params as Record<string, string | undefined>)}`,
    ),

  /** Os destaques da carteira: quem está há mais tempo, quem tem mais, etc. */
  stats: () => apiClient.get<InvestorStats>('/investors/stats'),

  overview: () => apiClient.get<InvestorOverview>('/investors/overview'),

  account: (id: string) =>
    apiClient.get<InvestorAccountDetail>(`/investors/accounts/${id}`),

  create: (body: {
    name: string; email: string; password: string; phone?: string;
    annualRate: number; noticeDays?: number; startDate?: string; notes?: string;
  }) => apiClient.post<{ userId: string; accountId: string }>('/investors/accounts', body),

  updateAccount: (id: string, body: {
    noticeDays?: number; status?: 'ACTIVE' | 'CLOSED'; notes?: string;
  }) => apiClient.patch<InvestorAccountDetail>(`/investors/accounts/${id}`, body),

  deposit: (id: string, body: { amount: number; day?: string; description?: string }) =>
    apiClient.post<{ balance: InvestorBalance }>(`/investors/accounts/${id}/deposits`, body),

  adjust: (id: string, body: { bucket: Bucket; amount: number; description: string }) =>
    apiClient.post<{ balance: InvestorBalance }>(`/investors/accounts/${id}/adjustments`, body),

  setRate: (id: string, body: { annualRate: number; effectiveFrom?: string }) =>
    apiClient.post<InvestorAccountDetail>(`/investors/accounts/${id}/rates`, body),

  pendingWithdrawals: () =>
    apiClient.get<{ withdrawals: InvestorWithdrawal[] }>('/investors/pending-withdrawals'),

  decideWithdrawal: (id: string, body: { approve: boolean; decision?: string }) =>
    apiClient.patch<{ withdrawal: InvestorWithdrawal }>(
      `/investors/withdrawals/${id}/decide`, body,
    ),
};
