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

  // As datas lidas do documento pela administração ao rever.
  //
  // Faltavam aqui, e o CreateDocumentData e o ReplaceDocumentData logo acima e
  // abaixo já as tinham — o que mostra que foi esquecimento e não decisão.
  //
  // O TypeScript não apanhou. O service constrói o objeto com spreads
  // (`...this.resolveDates(input)`), e a verificação de propriedades a mais só
  // corre em literais escritos à mão. Com spread, os campos que o tipo não
  // declara passam sem uma palavra — e depois eram descartados no repositório.
  issuedAt?: Date | null;
  expiresAt?: Date | null;
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