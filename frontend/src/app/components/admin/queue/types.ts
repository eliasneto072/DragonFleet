// src/app/components/admin/queue/types.ts
//
// A fila de trabalho do painel.
//
// ─── TRÊS NÍVEIS, E A DIFERENÇA IMPORTA ──────────────────────────────────────
//
// A versão anterior era uma lista única onde um botão "Ver" ficava ao lado de
// um "Responder", como se fossem a mesma coisa. Não são: "Ver" queria dizer
// *não há nada aqui para fazeres*, e obrigava a abrir outra tela para descobrir
// isso.
//
//   'resolve' — a decisão cabe num botão ou num campo. Resolve-se sem sair.
//   'open'    — precisa de um formulário ou de abrir um ficheiro. Expande para
//               mostrar QUEM espera, e cada linha abre já no item certo.
//   'inform'  — não há decisão nenhuma. Só precisa de ser sabido.
//
// ─── POR QUE UM REGISTO E NÃO OITO BLOCOS if ─────────────────────────────────
//
// A versão anterior tinha oito blocos `if` a empurrar objetos para um array,
// dentro do componente do painel. Acrescentar um item obrigava a mexer nesse
// ficheiro e a lembrar-se da ordenação, da pluralização e do estado de
// navegação. Aqui, um item novo é uma entrada no registo e um caso no painel —
// e nada mais precisa de mudar.

import type { LucideIcon } from 'lucide-react';

export type QueueTier = 'resolve' | 'open' | 'inform';

/**
 * Que conteúdo aparece ao expandir.
 *
 * É um identificador e não uma função de renderização: mantém o registo como
 * dados puros, testável e sem JSX, e concentra o desenho num sítio só.
 */
export type QueuePanel =
  | 'earnings'      // aprovar/rejeitar lançamentos comunicados
  | 'support'       // responder a tickets
  | 'expiring'      // avisar motoristas de documentos a expirar
  | 'settlements'   // listar quem falta fechar, abrir o fecho de cada um
  | 'withdrawals'   // listar retiradas pendentes, abrir no Financeiro
  | 'documents'     // listar documentos por rever
  | 'bank'          // listar IBAN por aprovar
  | 'drivers';      // lista simples de motoristas (saldo negativo, bloqueados)

export interface QueueItem {
  key: string;
  tier: QueueTier;
  icon: LucideIcon;
  title: string;
  detail: string;
  /** Dias de espera. Define a ordenação e o destaque de atraso. */
  waiting: number | null;
  /** Quantos itens estão por trás deste resumo. */
  count: number;
  panel: QueuePanel;
  /**
   * Motoristas já conhecidos a partir do resumo, quando o servidor os manda.
   * Poupa uma consulta ao expandir nos casos em que já temos os nomes.
   */
  drivers?: { id: string; name: string; balance?: number }[];
  /** Passado ao navegar: pré-preenche o formulário de destino. */
  navState?: Record<string, unknown>;
}

/** Acima disto, o item passa a ser destacado como atrasado. */
export const OVERDUE_DAYS = 3;

/**
 * Quantos itens uma expansão mostra antes de remeter para a tela dedicada.
 *
 * O painel resolve a cauda; as telas resolvem o volume. Sem este limite,
 * expandir "23 documentos por rever" transformava o painel numa versão pior da
 * tela de Documentos — com menos filtros, menos ordenação e mais código para
 * manter em dois sítios.
 */
export const PANEL_LIMIT = 5;

export const TIER_TITLES: Record<QueueTier, { title: string; subtitle: string }> = {
  resolve: {
    title: 'Resolver agora',
    subtitle: 'Decide aqui, sem sair do painel',
  },
  open: {
    title: 'Precisa de abrir',
    subtitle: 'Expanda para ver quem espera e ir direto ao item',
  },
  inform: {
    title: 'Para saber',
    subtitle: 'Não há nada a decidir — mas convém ver',
  },
};
