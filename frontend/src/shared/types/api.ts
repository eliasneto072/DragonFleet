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

  /** Recibo verde, anexado no momento do pedido. Obrigatório — nunca nulo. */
  receiptUrl: string;
  receiptKey: string;

  /**
   * IBAN de destino, copiado no momento da APROVAÇÃO e congelado aí.
   *
   * Nulo enquanto a retirada está por decidir. Se o motorista alterar os dados
   * bancários depois, uma transferência já decidida não muda de destino sem
   * ninguém reparar — mesma lógica da percentagem no fecho semanal.
   */
  paidToIban?:   string | null;
  paidToHolder?: string | null;
}

/**
 * Dados bancários de um motorista.
 *
 * Dois pares de campos, os em vigor e os pendentes. É essa separação que
 * permite o IBAN anterior continuar a valer enquanto uma alteração espera
 * decisão: se submeter apagasse já o valor bom, um engano de digitação deixava
 * a conta sem destino de pagamento até alguém corrigir.
 */
export interface ApiBankAccount {
  userId: string;

  /** Em vigor. Nulo até à primeira aprovação. */
  iban:       string | null;
  holderName: string | null;

  /** Submetido, à espera de decisão. */
  pendingIban:       string | null;
  pendingHolderName: string | null;
  pendingAt:         string | null;

  /** Motivo da última recusa. Uma submissão nova limpa-o. */
  rejectionReason: string | null;

  reviewedAt: string | null;
  updatedAt:  string | null;

  /** Derivado no servidor: há alteração à espera de decisão. */
  hasPending: boolean;
  /** Derivado no servidor: há IBAN em vigor — o motorista pode pedir retiradas. */
  isUsable: boolean;
}

/**
 * Uma linha da fila de aprovação: a conta, o comprovativo e quem submeteu.
 * Só o `GET /bank/pending` devolve o comprovativo.
 */
export interface ApiPendingBankAccount extends ApiBankAccount {
  proofUrl: string | null;
  user: { id: string; name: string; email: string };
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
  /**
   * Encargo semanal da viatura. Preenche o campo "Viatura" no fecho semanal
   * como valor sugerido; o fecho grava a sua própria cópia, para que alterar
   * isto não reescreva semanas já pagas.
   */
  weeklyFee: number;
  userId:    string | null;
  createdAt: string;
  updatedAt: string;
}

/** Histórico visto do lado do motorista: que carros conduziu, e quando. */
export interface ApiDriverAssignment {
  id:        string;
  vehicleId: string;
  userId:    string | null;
  startedAt: string;
  endedAt:   string | null;
  vehicle?: {
    id: string;
    brand: string;
    model: string;
    plate: string;
    year: number;
    status: VehicleStatus;
  } | null;
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