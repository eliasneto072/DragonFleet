// src/models/enums.ts

export enum UserRole {
  ADMIN = "ADMIN",
  DRIVER = "DRIVER",
  MANAGER = "MANAGER",
}

export enum UserStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  BLOCKED = "BLOCKED",
}

export enum DocumentType {
  CNH = "CNH",
  CRLV = "CRLV",
  RECIBO = "RECIBO",
  OTHER = "OTHER",
}

export enum DocumentStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum WithdrawalStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  PAID = "PAID",
}

