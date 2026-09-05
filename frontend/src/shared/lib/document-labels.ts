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
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  PENDING:  'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  EXPIRED:  'Expirado',
};

/** Dias até expirar (negativo se já expirou). Null se sem data. */
/**
 * A validade de um documento é um DIA, não um instante.
 *
 * O valor chega da API como "2026-12-31T00:00:00.000Z", porque um campo de data
 * do formulário dá "2026-12-31" e o `new Date()` do lado do servidor lê datas
 * sem hora como meia-noite UTC. Está certo: é a forma canónica de guardar um
 * dia.
 *
 * Errado era voltar a passá-lo por um `new Date()` para o mostrar. Num fuso a
 * oeste de Greenwich, a meia-noite UTC do dia 31 é ainda o dia 30 à noite, e a
 * tabela mostrava 30/12/2026 num documento que o formulário dizia ser 31. Uma
 * hora antes na base, um dia inteiro na tela.
 *
 * A saída é não converter. Os primeiros dez caracteres do ISO já são o dia que
 * foi escrito, e lê-los como texto dá o mesmo resultado em Lisboa, em Campina
 * Grande ou em Tóquio.
 */
export function diaDaValidade(iso?: string | null): { ano: number; mes: number; dia: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}

/** "2026-12-31T00:00:00.000Z" → "31/12/2026", em qualquer fuso. */
export function formatarValidade(iso?: string | null): string {
  const d = diaDaValidade(iso);
  if (!d) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.dia)}/${pad(d.mes)}/${d.ano}`;
}

/**
 * Quantos dias faltam até ao fim do dia da validade.
 *
 * Dois enganos de um dia de cada vez, e o segundo é o que interessa ao negócio.
 *
 * O primeiro era o fuso, pelo mesmo motivo de cima. O segundo é que a
 * meia-noite UTC do dia 31 é o PRINCÍPIO do dia 31, e comparar com agora dava o
 * documento por expirado durante todo o dia 31 — quando uma carta de condução
 * válida até 31 de dezembro é válida ao longo desse dia inteiro. Contar até ao
 * FIM do dia é o que corresponde ao que está escrito no documento.
 *
 * Ambos os lados são reduzidos a dias, para o resultado não depender da hora a
 * que alguém abre a tela.
 */
export function daysUntil(expiresAt?: string | null): number | null {
  const d = diaDaValidade(expiresAt);
  if (!d) return null;

  const fimDaValidade = Date.UTC(d.ano, d.mes - 1, d.dia);
  const agora = new Date();
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());

  return Math.round((fimDaValidade - hoje) / (1000 * 60 * 60 * 24));
}