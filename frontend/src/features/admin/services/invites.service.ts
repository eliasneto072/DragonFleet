// src/features/admin/services/invites.service.ts
//
// Os convites de uma frota — o link por onde um motorista entra.
//
// Vive em `features/admin` e não em `features/system` de propósito: isto é do
// GESTOR de cada frota, não do dono da plataforma. Cada frota gera os links
// dela, e o dono não está no meio de cada motorista que um cliente inscreve.
// A única rota pública é `resolver`, que é a página do convite.

import { apiClient } from '@/shared/lib/api-client';

export type EstadoDoConvite = 'valido' | 'revogado' | 'expirado' | 'esgotado';

export interface Convite {
  id: string;
  codigo: string;
  label: string | null;
  estado: EstadoDoConvite;
  /** Último dia em que vale. `null` = sem validade. */
  validoAte: string | null;
  maxUses: number | null;
  restantes: number | null;
  usos: number;
  criadoEm: string;
  criadoPor: string | null;
}

export interface Validade {
  dias: number | null;
  nome: string;
}

export interface EntradaDoConvite {
  label?: string | null;
  /** `null` = sem validade. */
  dias?: number | null;
  /** `null` = sem limite. */
  maxUses?: number | null;
}

/** O que a página do convite recebe antes de alguém se inscrever. */
export interface ConviteResolvido {
  estado: EstadoDoConvite;
  /** O nome da frota. `null` quando o convite não vale. */
  frota: { nome: string } | null;
  /** O que dizer a quem abriu o link. `null` quando está tudo bem. */
  mensagem: string | null;
}

export const invitesService = {
  list(): Promise<{ convites: Convite[]; validades: Validade[] }> {
    return apiClient.get('/invites');
  },

  create(entrada: EntradaDoConvite): Promise<{ convite: Convite }> {
    return apiClient.post('/invites', entrada);
  },

  revoke(id: string): Promise<{ ok: boolean }> {
    return apiClient.post(`/invites/${id}/revogar`, {});
  },

  /**
   * A rota pública. Responde 200 mesmo para um convite que não vale — o estado
   * vem no corpo, porque é informação e não erro.
   */
  resolver(codigo: string): Promise<ConviteResolvido> {
    return apiClient.get(`/auth/convite/${encodeURIComponent(codigo)}`);
  },
};

/**
 * O link a enviar ao motorista.
 *
 * Construído a partir de `window.location.origin` e não de uma constante: em
 * dragonfleet.pt tem de dizer dragonfleet.pt, e numa pré-visualização tem de
 * dizer o endereço da pré-visualização — senão o link copiado de lá leva o
 * motorista para o site a sério, com um código que ali não existe.
 */
export function linkDoConvite(codigo: string): string {
  return `${window.location.origin}/register/${codigo}`;
}
