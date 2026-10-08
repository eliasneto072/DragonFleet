// src/shared/services/pending.service.ts
//
// O que está por fazer, em toda a aplicação.
//
// Vive em `shared` e não em `features/admin` porque é lido em dois sítios: o
// painel, que desenha os resumos, e a moldura do painel, que põe os números ao
// lado de cada entrada do menu. São a mesma pergunta e a mesma resposta.
//
// O servidor devolve NÚMEROS; as palavras são escritas aqui no browser (ver
// `queue/registry.ts`). É a divisão que o projeto já usava: o servidor não
// sabe português nem sabe pluralizar, e assim mudar um texto não é um deploy
// do servidor.

import { apiClient } from '@/shared/lib/api-client';
import type { Area } from '@/shared/lib/areas';

/** As chaves de tudo o que pode estar por fazer. Espelha `fontes.ts`. */
export type PendingKey =
  | 'bookingsPropostas'
  | 'bookingsSemAcompanhante'
  | 'bookingsPorConcluir'
  | 'bookingsPendentes'
  | 'inspections'
  | 'vehiclesPending'
  | 'materialsLow'
  | 'withdrawalsPending'
  | 'bankPending'
  | 'scheduledLate'
  | 'negativeDrivers'
  | 'earningsPending'
  | 'missingSettlements'
  | 'documentsPending'
  | 'documentsExpiring'
  | 'supportOpen'
  | 'investorWithdrawals'
  | 'driversBlocked'
  | 'remindersDue';

/**
 *   'resolve' — alguém tem de decidir.
 *   'open'    — precisa de abrir um ecrã e tratar.
 *   'inform'  — não há decisão; só convém saber. Não conta para o menu.
 */
export type PendingLevel = 'resolve' | 'open' | 'inform';

export interface PendingSource {
  key: PendingKey;
  area: Area;
  nivel: PendingLevel;
  count: number;
  /** A data do mais antigo que espera. Nula quando não se aplica. */
  oldestAt: string | null;
  /** Já passou do prazo, ou espera há demasiado tempo. Pinta de vermelho. */
  late: boolean;
  /** O que a fonte precise de acrescentar: nomes, semanas, dias, atrasados. */
  extra?: {
    days?: number;
    overdue?: number;
    drivers?: { id: string; name: string }[];
    weekStart?: string;
    weekEnd?: string;
  };
}

export interface PendingSummary {
  /** Só as fontes com pelo menos um item, e só as que esta pessoa pode ver. */
  sources: PendingSource[];
  /** O número a mostrar em cada menu. Áreas sem nada por fazer não aparecem. */
  byArea: Partial<Record<Area, { count: number; late: boolean }>>;
  total: number;
  /** O relógio do servidor, para contar os dias na mesma base que ele. */
  now: string;
}

export const pendingService = {
  get(): Promise<{ pending: PendingSummary }> {
    return apiClient.get('/pending');
  },
};
