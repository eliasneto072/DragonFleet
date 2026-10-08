// src/app/components/admin/queue/types.ts
//
// A fila de trabalho do painel.
//
// ─── TRÊS NÍVEIS, E A DIFERENÇA IMPORTA ──────────────────────────────────────
//
//   'resolve' — alguém tem de decidir. Entra nos números do menu.
//   'open'    — precisa de abrir um ecrã e tratar. Entra nos números do menu.
//   'inform'  — não há decisão nenhuma. Só precisa de ser sabido, e NÃO entra
//               nos números: um saldo negativo regulariza-se no próximo fecho,
//               e até lá acendia o menu todos os dias. Um contador que nunca
//               chega a zero deixa de ser aviso e passa a decoração.
//
// ─── CADA LINHA NAVEGA ───────────────────────────────────────────────────────
//
// A versão anterior expandia painéis dentro do próprio painel: cada item tinha
// um `panel` e havia um ficheiro (`panels.tsx`) a desenhar oito listas, cada
// uma com o seu pedido ao servidor. Isso fazia do painel uma segunda versão
// pior de cada tela — com menos filtros, menos ordenação, e a mesma lógica
// escrita em dois sítios.
//
// Agora cada linha leva um `to` e abre a tela a sério. O painel passa a ser o
// que devia ser: o mapa do que falta, e não o sítio onde se faz tudo.
//
// ─── POR QUE UM REGISTO E NÃO DEZENOVE BLOCOS if ─────────────────────────────
//
// Porque são dezenove fontes. Com elas escritas dentro do componente,
// acrescentar uma obrigava a mexer na renderização e a lembrar-se da
// pluralização, da ordenação e do caminho do menu. Aqui é uma entrada no
// registo, e nada mais muda.

import type { LucideIcon } from 'lucide-react';
import type { PendingKey, PendingLevel } from '@/shared/services/pending.service';

export type QueueTier = PendingLevel;

export interface QueueItem {
  key: PendingKey;
  tier: QueueTier;
  icon: LucideIcon;
  /** A linha de cima: "3 marcações com hora nova proposta". */
  title: string;
  /** A linha de baixo: a idade, os nomes, o que está em causa. */
  detail: string;
  /** Dias de espera. Define a ordenação. */
  waiting: number | null;
  count: number;
  /** Já arde: passou do prazo, ou espera há demasiado tempo. */
  late: boolean;
  /** O ecrã que resolve isto. É para aqui que a linha leva. */
  to: string;
  /** Passado ao navegar: pré-preenche ou filtra o ecrã de destino. */
  navState?: Record<string, unknown>;
}

export const TIER_TITLES: Record<QueueTier, { title: string; subtitle: string }> = {
  resolve: {
    title: 'Resolver agora',
    subtitle: 'Alguém tem de decidir isto',
  },
  open: {
    title: 'Precisa de tratar',
    subtitle: 'Carregue na linha para abrir o ecrã que resolve',
  },
  inform: {
    title: 'Para saber',
    subtitle: 'Não há nada a decidir — mas convém ver',
  },
};
