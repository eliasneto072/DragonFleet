// src/shared/services/projects.service.ts
//
// Projetos de investimento: um carro financiado por investidores, que repartem
// o que ele der todos os meses.
//
// O portal do investidor e a tela de administração falam com a mesma API, por
// isso os tipos vivem num ficheiro só — dois conjuntos de tipos para os mesmos
// dados divergem ao segundo mês.

import { apiClient } from '@/shared/lib/api-client';

export type ProjectStatus = 'DRAFT' | 'FUNDING' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';
export type PeriodStatus = 'DRAFT' | 'DISTRIBUTED';
export type ShareStatus = 'ACTIVE' | 'LIQUIDATED' | 'CANCELLED';

export const ESTADO_DO_PROJETO: Record<ProjectStatus, string> = {
  DRAFT: 'Rascunho',
  FUNDING: 'A angariar',
  ACTIVE: 'A render',
  CLOSED: 'Fechado',
  CANCELLED: 'Cancelado',
};

export interface Project {
  id: string;
  name: string;
  description: string | null;
  targetAmount: number;
  minTicket: number;
  /** A fatia do lucro que vai para os investidores, em percentagem. */
  profitShare: number;
  vehicleId: string | null;
  vehicle: { id: string; brand: string; model: string; plate: string } | null;
  includeCommission: boolean;
  includeVehicleFee: boolean;
  status: ProjectStatus;
  fundingClosesOn: string | null;
  /** Mês de arranque, 'AAAA-MM'. */
  startedOn: string | null;
  endsOn: string | null;
  closedOn: string | null;
  saleAmount: number | null;
  riskLevel: string | null;
  imageUrl: string | null;
  createdAt: string;
}

export interface ProjectListItem extends Project {
  raised: number;
  investorsCount: number;
  /** Quanto já foi distribuído aos investidores, ao todo. */
  distributed: number;
  /** Quanto EU tenho aplicado neste projeto. */
  myAmount: number;
}

export interface ProjectPeriod {
  id: string;
  /** 'AAAA-MM'. */
  month: string;
  commissionTotal: number;
  vehicleFeeTotal: number;
  expensesTotal: number;
  settlementsCount: number;
  profit: number;
  investorsAmount: number;
  profitShare: number;
  status: PeriodStatus;
  distributedAt: string | null;
  notes: string | null;
}

export interface ProjectShare {
  id: string;
  accountId: string;
  amount: number;
  status: ShareStatus;
  liquidatedAmount: number | null;
  createdAt: string;
  investor: { id: string; name: string; email: string } | null;
}

export interface ProjectExpense {
  id: string;
  month: string;
  amount: number;
  description: string;
}

export interface ProjectDetail {
  project: Project & { raised: number; investorsCount: number; distributed: number };
  periods: ProjectPeriod[];
  /** Vazio para um investidor: ele não vê as participações dos outros. */
  shares: ProjectShare[];
  expenses: ProjectExpense[];
  mine: {
    amount: number;
    ratio: number;
    /** O que EU já recebi deste projeto. */
    received: number;
    liquidated: number;
  } | null;
}

export interface MyShare {
  id: string;
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
  amount: number;
  status: ShareStatus;
  received: number;
  liquidatedAmount: number | null;
  createdAt: string;
}

function qs(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

const raiz = '/investors/projects';

export const projectsService = {
  list: (params: { status?: string; search?: string } = {}) =>
    apiClient.get<{ projects: ProjectListItem[] }>(`${raiz}${qs(params)}`),

  get: (id: string) => apiClient.get<ProjectDetail>(`${raiz}/${id}`),

  myShares: () => apiClient.get<{ shares: MyShare[] }>(`${raiz}/mine`),

  subscribe: (id: string, amount: number) =>
    apiClient.post<{ share: { id: string; amount: number; raised: number } }>(
      `${raiz}/${id}/subscribe`, { amount },
    ),

  // ── Administração ─────────────────────────────────────────────────────────

  create: (body: {
    name: string; description?: string; targetAmount: number; minTicket?: number;
    profitShare?: number; vehicleId?: string | null; riskLevel?: string;
    fundingClosesOn?: string; endsOn?: string;
    includeCommission?: boolean; includeVehicleFee?: boolean;
  }) => apiClient.post<{ project: Project }>(raiz, body),

  update: (id: string, body: Record<string, unknown>) =>
    apiClient.patch<{ project: Project }>(`${raiz}/${id}`, body),

  openFunding: (id: string) => apiClient.post<{ project: Project }>(`${raiz}/${id}/open`, {}),

  activate: (id: string, startedOn?: string) =>
    apiClient.post<{ project: Project }>(`${raiz}/${id}/activate`, { startedOn }),

  cancel: (id: string, reason?: string) =>
    apiClient.post<ProjectDetail>(`${raiz}/${id}/cancel`, { reason }),

  close: (id: string, body: { saleAmount?: number | null; notes?: string }) =>
    apiClient.post<{ project: Project }>(`${raiz}/${id}/close`, body),

  computeMonth: (id: string, month: string) =>
    apiClient.post<{ period: ProjectPeriod }>(`${raiz}/${id}/periods/${month}/compute`, {}),

  computePending: (id: string) =>
    apiClient.post<{ periods: ProjectPeriod[] }>(`${raiz}/${id}/periods/compute`, {}),

  distribute: (id: string, month: string) =>
    apiClient.post<{ period: ProjectPeriod }>(`${raiz}/${id}/periods/${month}/distribute`, {}),

  addExpense: (id: string, body: { month: string; amount: number; description: string }) =>
    apiClient.post<{ period: ProjectPeriod }>(`${raiz}/${id}/expenses`, body),

  removeExpense: (expenseId: string) =>
    apiClient.delete<{ period: ProjectPeriod }>(`${raiz}/expenses/${expenseId}`),
};
