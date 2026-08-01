import { DocumentStatus, DocumentType } from '../../shared/types/enums';

export type CreateDocumentInput = {
  type: DocumentType;
  fileUrl: string;
  fileKey: string;
  vehicleId?: string; // se presente, documento pertence a um veículo (não é pessoal)
};

export type UpdateDocumentInput = {
  type?: DocumentType;
  fileUrl?: string;
};

/**
 * Estado do documento, mais as datas lidas pela administração ao rever.
 *
 * `null` limpa a data — ou marca o documento como sem validade, no caso de
 * expiresAt. `undefined` deixa como está, para que rejeitar não obrigue a
 * preencher nada.
 */
export type UpdateDocumentStatusInput = {
  status: DocumentStatus;
  notes?: string;
  issuedAt?: Date | string | null;
  expiresAt?: Date | string | null;
};
