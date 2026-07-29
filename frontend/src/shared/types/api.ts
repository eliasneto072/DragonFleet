// src/shared/types/api.ts
// Espelha os tipos públicos do backend — mantido em sincronia com o schema Prisma.

// ---------- Enums ----------

export type UserRole   = 'ADMIN' | 'DRIVER' | 'MANAGER';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'AGUARDANDO_REGULARIZACAO';

export type EarningPlatform  = 'UBER' | 'BOLT' | 'FREE_NOW' | 'OTHER';
export type DocumentType =
  // Motorista
  | 'CARTAO_CIDADAO'
  | 'REGISTO_CRIMINAL'
  | 'CARTA_CONDUCAO'
  | 'CERTIFICADO_TVDE'
  | 'FOTO_PERFIL'
  // Veículo
  | 'DUA'
  | 'SEGURO_CARTA_VERDE'
  | 'SEGURO_CONDICOES_ESPECIAIS'
  | 'INSPECAO_PERIODICA'
  | 'OTHER';
export type DocumentStatus   = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
export type EarningStatus    = 'PENDING' | 'APPROVED' | 'REJECTED';
export type SettlementStatus = 'DRAFT' | 'REGISTERED' | 'CANCELLED';
export type VehicleStatus    = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'SOLD';

// ---------- Modelos ----------

export interface ApiUser {
  id:        string;
  name:      string;
  email:     string;
  role:      UserRole;
  status:    UserStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lançamento comunicado pelo motorista.
 *
 * NÃO movimenta saldo em nenhum estado. O dinheiro entra por uma porta só — o
 * fecho semanal registado pela administração. Isto é o que o motorista diz ter
 * feito, e serve de conferência a quem fecha a semana.
 */
export interface ApiEarning {
  id:        string;
  amount:    number;
  date:      string;
  platform:  EarningPlatform;
  status:    EarningStatus;
  /** Justificação do motorista, ou motivo da recusa. */
  notes:     string | null;
  userId:    string;
  reviewedById: string | null;
  reviewedAt:   string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiWithdrawal {
  id:          string;
  amount:      number;
  status:      WithdrawalStatus;
  notes?:      string | null;
  requestedAt: string;
  processedAt?: string | null;
  userId:      string;
}

export interface ApiDocument {
  id:        string;
  type:      DocumentType;
  fileUrl:   string;
  fileKey:   string;
  notes?:    string | null;
  status:    DocumentStatus;
  issuedAt?:  string | null;
  expiresAt?: string | null;
  userId:    string;
  vehicleId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiNotification {
  id:        string;
  title:     string;
  message:   string;
  read:      boolean;
  userId:    string;
  createdAt: string;
}

export interface ApiVehicle {
  id:        string;
  brand:     string;
  model:     string;
  plate:     string;
  year:      number;
  vin:       string | null;
  status:    VehicleStatus;
  activationForced: boolean;
  userId:    string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiVehicleAssignment {
  id:        string;
  vehicleId: string;
  userId:    string | null;
  startedAt: string;
  endedAt:   string | null;
  user?: {
    id: string;
    name: string;
    email: string;
  } | null;
}