import { DocumentStatus, DocumentType } from '../../shared/types/enums';

export type CreateDocumentData = {
  type: DocumentType;
  fileUrl: string;
  fileKey: string; // ← novo
  status: DocumentStatus; // service decide (default PENDING)
  userId: string;
};

export type UpdateDocumentData = {
  type?: DocumentType;
  fileUrl?: string;
  status?: DocumentStatus;
};