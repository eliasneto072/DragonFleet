// src/features/admin/services/bookings.service.ts
//
// Marcações de oficina.
//
// A MESMA rota serve a gestão, o motorista e o mecânico — o servidor é que
// filtra o que cada um vê. Daí não haver aqui três serviços nem três tipos:
// são as mesmas marcações, vistas de sítios diferentes.

import { apiClient } from '@/shared/lib/api-client';

export type BookingStatus =
  | 'PENDENTE' | 'NOVA_DATA_PROPOSTA' | 'CONFIRMADA'
  | 'CONCLUIDA' | 'CANCELADA' | 'RECUSADA';

export type BookingLogistics = 'MOTORISTA_LEVA' | 'OFICINA_RECOLHE' | 'EMPRESA_LEVA';
export type BookingFileKind = 'FATURA' | 'COMPROVATIVO' | 'OUTRO';
export type WorkshopKind = 'OFICINA' | 'INSPECAO' | 'PNEUS' | 'OUTRO';

/** O que cada estado quer dizer, e a cor com que aparece. */
export const ESTADOS: Record<BookingStatus, { rotulo: string; tom: 'espera' | 'ok' | 'mau' | 'feito' }> = {
  PENDENTE:           { rotulo: 'À espera da oficina', tom: 'espera' },
  NOVA_DATA_PROPOSTA: { rotulo: 'Nova hora proposta',  tom: 'espera' },
  CONFIRMADA:         { rotulo: 'Confirmada',          tom: 'ok' },
  CONCLUIDA:          { rotulo: 'Concluída',           tom: 'feito' },
  CANCELADA:          { rotulo: 'Cancelada',           tom: 'mau' },
  RECUSADA:           { rotulo: 'Recusada',            tom: 'mau' },
};

export const LOGISTICAS: Record<BookingLogistics, string> = {
  MOTORISTA_LEVA:  'O motorista leva o carro',
  OFICINA_RECOLHE: 'A oficina vai buscar o carro',
  EMPRESA_LEVA:    'A empresa leva o carro',
};

export const TIPOS_DE_OFICINA: Record<WorkshopKind, string> = {
  OFICINA:  'Oficina',
  INSPECAO: 'Centro de inspeção',
  PNEUS:    'Pneus',
  OUTRO:    'Outro',
};

export interface Workshop {
  id: string;
  name: string;
  kind: WorkshopKind;
  address: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
}

export interface ServiceType {
  id: string;
  label: string;
  /** Marca as inspeções periódicas — ao concluir uma, pede-se a nova validade. */
  isInspection: boolean;
  active: boolean;
}

/** Uma conta de oficina: entra, vê as marcações da oficina dela, e mais nada. */
export interface Mechanic {
  id: string;
  name: string;
  email: string;
  status: string;
  workshopId: string | null;
  workshop: { id: string; name: string } | null;
}

export interface BookingFile {
  id: string;
  kind: BookingFileKind;
  fileUrl: string;
  fileName: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface Booking {
  id: string;
  vehicleId: string;
  vehiclePlate: string | null;
  vehicleName: string | null;
  driverId: string | null;
  driverName: string | null;
  /** Vai para a oficina de propósito: é o que ela precisa se o carro não aparecer. */
  driverPhone: string | null;
  workshopId: string;
  workshopName: string | null;
  workshopKind: WorkshopKind | null;
  workshopAddress: string | null;
  workshopPhone: string | null;
  serviceTypeId: string;
  serviceLabel: string | null;
  isInspection: boolean;
  description: string | null;
  scheduledAt: string;
  /** A hora que a oficina contrapôs. Nula fora desse estado. */
  proposedAt: string | null;
  proposalReason: string | null;
  status: BookingStatus;
  logistics: BookingLogistics;
  needsEscort: boolean;
  escortId: string | null;
  escortName: string | null;
  /** Nulo até concluir. Zero é um custo válido — uma reparação em garantia. */
  cost: number | null;
  completionNotes: string | null;
  completedAt: string | null;
  cancelReason: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  files: BookingFile[];
  /**
   * O material que saiu do nosso stock nesta ida à oficina.
   *
   * É a metade do custo que não aparece em factura nenhuma — o óleo e os
   * filtros são nossos. Sem isto, uma revisão feita com material da casa custa
   * zero, e o carro onde se gasta mais material parecia o mais barato da frota.
   */
  materials: { id: string; name: string | null; unit: string | null; qty: number; total: number }[];
  materialCost: number;
}

export const bookingsService = {
  list(params: { status?: string; vehicleId?: string; abertas?: boolean } = {}): Promise<{ bookings: Booking[] }> {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.vehicleId) q.set('vehicleId', params.vehicleId);
    if (params.abertas) q.set('abertas', 'true');
    const s = q.toString();
    return apiClient.get(`/bookings${s ? `?${s}` : ''}`);
  },

  getById(id: string): Promise<{ booking: Booking }> {
    return apiClient.get(`/bookings/${id}`);
  },

  create(input: {
    vehicleId: string;
    workshopId: string;
    serviceTypeId: string;
    /** ISO com hora — uma marcação sem hora é um recado, não uma marcação. */
    scheduledAt: string;
    description?: string | null;
    logistics?: BookingLogistics;
    needsEscort?: boolean;
  }): Promise<{ booking: Booking }> {
    return apiClient.post('/bookings', input);
  },

  /** A oficina aceita a hora proposta. */
  confirm(id: string): Promise<{ booking: Booking }> {
    return apiClient.post(`/bookings/${id}/confirm`, {});
  },

  /** A oficina contrapõe outra hora. Não muda a data — propõe. */
  propose(id: string, scheduledAt: string, reason?: string): Promise<{ booking: Booking }> {
    return apiClient.post(`/bookings/${id}/propose`, { scheduledAt, reason });
  },

  /** Quem pediu aceita a contraproposta. */
  acceptProposal(id: string): Promise<{ booking: Booking }> {
    return apiClient.post(`/bookings/${id}/accept-proposal`, {});
  },

  refuse(id: string, reason: string): Promise<{ booking: Booking }> {
    return apiClient.post(`/bookings/${id}/refuse`, { reason });
  },

  cancel(id: string, reason?: string): Promise<{ booking: Booking }> {
    return apiClient.post(`/bookings/${id}/cancel`, { reason });
  },

  complete(id: string, input: {
    cost?: number | null;
    notes?: string | null;
    /** Só nas inspeções: até quando vale a nova. */
    nextInspectionOn?: string | null;
  }): Promise<{ booking: Booking }> {
    return apiClient.post(`/bookings/${id}/complete`, input);
  },

  /** `null` tira o acompanhante. */
  assignEscort(id: string, escortId: string | null): Promise<{ booking: Booking }> {
    return apiClient.post(`/bookings/${id}/escort`, { escortId });
  },

  addFile(id: string, f: {
    kind: BookingFileKind; fileUrl: string; fileKey: string; fileName?: string | null;
  }): Promise<{ booking: Booking }> {
    return apiClient.post(`/bookings/${id}/files`, f);
  },

  /**
   * Envia o ficheiro e anexa-o, num só pedido.
   *
   * Não passa por `/upload`: essa rota está fechada às contas de oficina, e é
   * a oficina que tem a factura na mão. Ver a nota na rota.
   */
  uploadFile(id: string, kind: BookingFileKind, ficheiro: File): Promise<{ booking: Booking }> {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', ficheiro);
    return apiClient.upload(`/bookings/${id}/files/upload`, form);
  },

  /** Quem pode ir acompanhar um carro — só a gestão pergunta isto. */
  listEscorts(): Promise<{ escorts: { id: string; name: string; role: string }[] }> {
    return apiClient.get('/bookings/escorts');
  },

  removeFile(id: string, fileId: string): Promise<{ booking: Booking }> {
    return apiClient.delete(`/bookings/${id}/files/${fileId}`);
  },

  // ── Oficinas ─────────────────────────────────────────────────────────────
  listWorkshops(todas = false): Promise<{ workshops: Workshop[] }> {
    return apiClient.get(`/bookings/workshops${todas ? '?all=true' : ''}`);
  },

  createWorkshop(input: {
    name: string; kind?: WorkshopKind;
    address?: string | null; phone?: string | null; notes?: string | null;
  }): Promise<{ workshop: Workshop }> {
    return apiClient.post('/bookings/workshops', input);
  },

  updateWorkshop(id: string, input: Partial<Workshop>): Promise<{ workshop: Workshop }> {
    return apiClient.patch(`/bookings/workshops/${id}`, input);
  },

  // ── Contas de oficina ────────────────────────────────────────────────────
  //
  // Criam-se aqui e não na Equipa: um mecânico não é motorista e não passa
  // pelo registo público. Só o administrador — ver a nota no serviço.
  listMechanics(): Promise<{ mechanics: Mechanic[] }> {
    return apiClient.get('/bookings/mechanics');
  },

  createMechanic(input: {
    workshopId: string; name: string; email: string; password: string;
  }): Promise<{ mechanic: Mechanic }> {
    return apiClient.post('/bookings/mechanics', input);
  },

  updateMechanic(id: string, input: {
    workshopId?: string | null; active?: boolean; password?: string;
  }): Promise<{ mechanic: Mechanic }> {
    return apiClient.patch(`/bookings/mechanics/${id}`, input);
  },

  // ── Tipos de serviço ─────────────────────────────────────────────────────
  listServiceTypes(todos = false): Promise<{ serviceTypes: ServiceType[] }> {
    return apiClient.get(`/bookings/service-types${todos ? '?all=true' : ''}`);
  },

  createServiceType(label: string, isInspection = false): Promise<{ serviceType: ServiceType }> {
    return apiClient.post('/bookings/service-types', { label, isInspection });
  },

  setServiceTypeActive(id: string, active: boolean): Promise<{ serviceType: ServiceType }> {
    return apiClient.patch(`/bookings/service-types/${id}`, { active });
  },
};
