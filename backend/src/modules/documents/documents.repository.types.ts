import { DocumentStatus, DocumentType } from '../../shared/types/enums';

export type CreateDocumentData = {
  type: DocumentType;
  fileUrl: string;
  fileKey: string; // ← novo
  status: DocumentStatus; // service decide (default PENDING)
  userId: string;
  issuedAt?: Date | null; // data de emissão (Registo Criminal)
  expiresAt?: Date | null; // emissão + 90 dias
};

export type UpdateDocumentData = {
  type?: DocumentType;
  fileUrl?: string;
  status?: DocumentStatus;
  notes?: string | null; // ← persistir o motivo de rejeição
};