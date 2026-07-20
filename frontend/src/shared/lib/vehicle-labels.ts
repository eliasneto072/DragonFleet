// src/shared/lib/vehicle-labels.ts
//
// Rótulos, estilos de estado e helpers da área de veículos.

import type { VehicleStatus, ApiDocument } from '@/shared/types/api';

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  PENDING:     'Pendente',
  ACTIVE:      'Ativo',
  INACTIVE:    'Inativo',
  MAINTENANCE: 'Manutenção',
  SOLD:        'Vendido',
};

// Classes de cor (Tailwind) para o badge de estado.
export const VEHICLE_STATUS_STYLES: Record<VehicleStatus, string> = {
  PENDING:     'bg-amber-100 text-amber-700',
  ACTIVE:      'bg-green-100 text-green-700',
  INACTIVE:    'bg-secondary text-muted-foreground',
  MAINTENANCE: 'bg-orange-100 text-orange-700',
  SOLD:        'bg-destructive/10 text-destructive',
};

// Os 4 documentos obrigatórios do veículo (na ordem de exibição).
export const VEHICLE_REQUIRED_DOCS = [
  'DUA',
  'SEGURO_CARTA_VERDE',
  'SEGURO_CONDICOES_ESPECIAIS',
  'INSPECAO_PERIODICA',
] as const;

export type VehicleDocSummary = {
  approved: number;      // quantos dos obrigatórios estão aprovados
  total: number;         // total de obrigatórios (4)
  hasProblem: boolean;   // algum rejeitado/expirado
  allApproved: boolean;  // os 4 aprovados
};

/**
 * Resume o estado dos documentos obrigatórios de um veículo, para o badge da lista.
 * Recebe os documentos já filtrados desse veículo.
 */
export function summarizeVehicleDocs(docs: ApiDocument[]): VehicleDocSummary {
  const required = new Set<string>(VEHICLE_REQUIRED_DOCS);
  const relevant = docs.filter((d) => required.has(d.type));

  const approved = relevant.filter((d) => d.status === 'APPROVED').length;
  const hasProblem = relevant.some((d) => d.status === 'REJECTED' || d.status === 'EXPIRED');
  const allApproved = VEHICLE_REQUIRED_DOCS.every((t) =>
    relevant.some((d) => d.type === t && d.status === 'APPROVED'),
  );

  return { approved, total: VEHICLE_REQUIRED_DOCS.length, hasProblem, allApproved };
}
