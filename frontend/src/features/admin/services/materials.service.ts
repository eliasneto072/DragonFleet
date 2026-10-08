// src/features/admin/services/materials.service.ts
//
// Inventário de material.
//
// Os números vêm todos feitos do servidor — o valor do stock, o total por
// carro, se está abaixo do mínimo. Fazê-los aqui dava duas versões da mesma
// conta, e a que aparece na tela seria a que ninguém testou.

import { apiClient } from '@/shared/lib/api-client';

export type StockMoveKind = 'ENTRADA' | 'SAIDA' | 'AJUSTE';

/** O que cada movimento quer dizer, em português e com a cor certa. */
export const MOVIMENTOS: Record<StockMoveKind, { rotulo: string; tom: 'entra' | 'sai' | 'ajuste' }> = {
  ENTRADA: { rotulo: 'Compra',   tom: 'entra' },
  SAIDA:   { rotulo: 'Consumo',  tom: 'sai' },
  AJUSTE:  { rotulo: 'Contagem', tom: 'ajuste' },
};

export interface Material {
  id: string;
  name: string;
  sku: string | null;
  /** un, L, kg, par — texto livre, é a frota que decide. */
  unit: string;
  category: string | null;
  minQty: number | null;
  qty: number;
  /** Custo médio ponderado por unidade. Ver `custeio.ts` no servidor. */
  avgCost: number;
  stockValue: number;
  /** Já abaixo (ou igual) ao mínimo. Sem mínimo, nunca é verdade. */
  low: boolean;
  notes: string | null;
  active: boolean;
}

export interface StockMove {
  id: string;
  materialId: string;
  materialName: string | null;
  unit: string | null;
  kind: StockMoveKind;
  qty: number;
  unitCost: number | null;
  totalCost: number | null;
  supplier: string | null;
  invoiceRef: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  bookingId: string | null;
  bookingLabel: string | null;
  driverId: string | null;
  driverName: string | null;
  notes: string | null;
  occurredAt: string;
  createdByName: string | null;
  createdAt: string;
}

export interface MaterialsSummary {
  /** Quanto vale o que está na prateleira — o número do inventário. */
  stockValue: number;
  materials: number;
  low: number;
  purchases: { total: number; count: number };
  consumption: { total: number; count: number };
  /** À parte das outras duas de propósito: não é compra nem consumo. */
  adjustments: { total: number; count: number };
}

export interface CostByVehicleRow {
  vehicleId: string | null;
  plate: string;
  name: string | null;
  total: number;
  moves: number;
}

export const materialsService = {
  list(params: {
    search?: string; category?: string; all?: boolean; low?: boolean;
  } = {}): Promise<{ materials: Material[] }> {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.category) q.set('category', params.category);
    if (params.all) q.set('all', 'true');
    if (params.low) q.set('low', 'true');
    const s = q.toString();
    return apiClient.get(`/materials${s ? `?${s}` : ''}`);
  },

  categories(): Promise<{ categories: string[] }> {
    return apiClient.get('/materials/categories');
  },

  create(input: {
    name: string; sku?: string | null; unit?: string;
    category?: string | null; minQty?: number | null; notes?: string | null;
  }): Promise<{ material: Material }> {
    return apiClient.post('/materials', input);
  },

  /** Edita o que o material É. O stock mexe-se com movimentos, não por aqui. */
  update(id: string, input: {
    name?: string; sku?: string | null; unit?: string;
    category?: string | null; minQty?: number | null; notes?: string | null;
    active?: boolean;
  }): Promise<{ material: Material }> {
    return apiClient.patch(`/materials/${id}`, input);
  },

  moves(params: {
    materialId?: string; vehicleId?: string; bookingId?: string;
    kind?: StockMoveKind; from?: string; to?: string; take?: number;
  } = {}): Promise<{ moves: StockMove[] }> {
    const q = new URLSearchParams();
    if (params.materialId) q.set('materialId', params.materialId);
    if (params.vehicleId) q.set('vehicleId', params.vehicleId);
    if (params.bookingId) q.set('bookingId', params.bookingId);
    if (params.kind) q.set('kind', params.kind);
    if (params.from) q.set('from', params.from);
    if (params.to) q.set('to', params.to);
    if (params.take) q.set('take', String(params.take));
    const s = q.toString();
    return apiClient.get(`/materials/moves${s ? `?${s}` : ''}`);
  },

  /**
   * Registar um movimento.
   *
   * No AJUSTE, `qty` é a quantidade CONTADA e não a diferença — é o que a
   * pessoa tem à frente dos olhos. A diferença é o servidor que a calcula.
   */
  registerMove(input: {
    materialId: string;
    kind: StockMoveKind;
    qty: number;
    unitCost?: number | null;
    supplier?: string | null;
    invoiceRef?: string | null;
    vehicleId?: string | null;
    bookingId?: string | null;
    driverId?: string | null;
    notes?: string | null;
    occurredAt?: string | null;
  }): Promise<{ move: StockMove; material: Material }> {
    return apiClient.post('/materials/moves', input);
  },

  summary(periodo: { from?: string; to?: string } = {}): Promise<{ summary: MaterialsSummary }> {
    const q = new URLSearchParams();
    if (periodo.from) q.set('from', periodo.from);
    if (periodo.to) q.set('to', periodo.to);
    const s = q.toString();
    return apiClient.get(`/materials/summary${s ? `?${s}` : ''}`);
  },

  costByVehicle(periodo: { from?: string; to?: string } = {}): Promise<{ rows: CostByVehicleRow[] }> {
    const q = new URLSearchParams();
    if (periodo.from) q.set('from', periodo.from);
    if (periodo.to) q.set('to', periodo.to);
    const s = q.toString();
    return apiClient.get(`/materials/by-vehicle${s ? `?${s}` : ''}`);
  },
};
