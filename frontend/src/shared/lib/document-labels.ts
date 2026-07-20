// src/shared/lib/document-labels.ts
//
// Rótulos e agrupamento dos tipos de documento (Portugal TVDE), partilhados
// entre as telas de motorista e admin para evitar duplicação.

import type { DocumentType, DocumentStatus } from '@/shared/types/api';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  // Motorista
  CARTAO_CIDADAO:             'Cartão de Cidadão',
  REGISTO_CRIMINAL:           'Registo Criminal',
  CARTA_CONDUCAO:             'Carta de Condução',
  CERTIFICADO_TVDE:           'Certificado de Motorista TVDE',
  FOTO_PERFIL:                'Fotografia de Perfil',
  // Veículo
  DUA:                        'DUA — Documento Único Automóvel',
  SEGURO_CARTA_VERDE:         'Seguro Automóvel (Carta Verde)',
  SEGURO_CONDICOES_ESPECIAIS: 'Seguro Automóvel (Condições Especiais)',
  INSPECAO_PERIODICA:         'Inspeção Técnica Periódica',
  OTHER:                      'Outro',
};

// Tipos que o motorista envia (documentos pessoais).
export const DRIVER_DOCUMENT_TYPES: DocumentType[] = [
  'CARTAO_CIDADAO',
  'REGISTO_CRIMINAL',
  'CARTA_CONDUCAO',
  'CERTIFICADO_TVDE',
  'FOTO_PERFIL',
];

// Tipos de documento do veículo.
export const VEHICLE_DOCUMENT_TYPES: DocumentType[] = [
  'DUA',
  'SEGURO_CARTA_VERDE',
  'SEGURO_CONDICOES_ESPECIAIS',
  'INSPECAO_PERIODICA',
];

// Só o Registo Criminal tem regra de validade (90 dias) por agora.
export function requiresIssueDate(type: DocumentType): boolean {
  return type === 'REGISTO_CRIMINAL';
}

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  PENDING:  'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  EXPIRED:  'Expirado',
};

/** Dias até expirar (negativo se já expirou). Null se sem data. */
export function daysUntil(expiresAt?: string | null): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
