import { DocumentStatus, DocumentType } from '../../shared/types/enums';

export type CreateDocumentData = {
  type: DocumentType;
  fileUrl: string;
  fileKey: string;
  status: DocumentStatus; // service decide (default PENDING)
  userId: string;
  vehicleId?: string | null; // documento de veículo (null = pessoal)
  issuedAt?: Date | null; // data de emissão (Registo Criminal)
  expiresAt?: Date | null; // emissão + 90 dias
};

export type UpdateDocumentData = {
  type?: DocumentType;
  fileUrl?: string;
  status?: DocumentStatus;
  notes?: string | null; // persistir o motivo de rejeição
};

// Substituição completa de um documento existente (re-upload após rejeição/expiração).
export type ReplaceDocumentData = {
  fileUrl: string;
  fileKey: string;
  status: DocumentStatus;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
  notes?: string | null;
};