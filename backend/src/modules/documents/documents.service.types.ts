import { DocumentStatus, DocumentType } from '../../shared/types/enums';

export type CreateDocumentInput = {
  type: DocumentType;
  fileUrl: string;
  fileKey: string;
  issuedAt?: string; // data de emissão (ISO) — usada pelo Registo Criminal
};

export type UpdateDocumentInput = {
  type?: DocumentType;
  fileUrl?: string;
};

export type UpdateDocumentStatusInput = {
  status: DocumentStatus;
  notes?: string;
};