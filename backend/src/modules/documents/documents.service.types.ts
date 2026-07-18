import { DocumentStatus, DocumentType } from '../../shared/types/enums';

export type CreateDocumentInput = {
  type: DocumentType;
  fileUrl: string;
  fileKey: string;
};

export type UpdateDocumentInput = {
  type?: DocumentType;
  fileUrl?: string;
};

export type UpdateDocumentStatusInput = {
  status: DocumentStatus;
  notes?: string;
};