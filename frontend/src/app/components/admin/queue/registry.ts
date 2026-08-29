// src/app/components/admin/queue/registry.ts
//
// Constrói a fila a partir do resumo do servidor.
//
// Dados puros, sem JSX: dá para ler a lista inteira de uma vez e perceber o que
// o painel mostra, sem atravessar renderização. Acrescentar um item é uma
// entrada aqui e um caso no panels.tsx.

import {
  CalendarClock, Coins, FileText, HandCoins, Landmark, MessageCircle,
  ReceiptText, TrendingDown, UserX,
} from 'lucide-react';
import type { QueueItem } from './types';
import type { ApiOverview } from '@/features/admin/services/analytics.service';

/** Dias inteiros desde uma data ISO. */
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function ago(days: number | null): string {
  if (days === null) return '';
  if (days === 0) return 'chegou hoje';
  if (days === 1) return 'espera há 1 dia';
  return `espera há ${days} dias`;
}

/** Plural simples: `n` itens de `singular`, acrescentando `sufixo`. */
function plural(n: number, singular: string, sufixo = 's'): string {
  return n === 1 ? singular : `${singular}${sufixo}`;
}

function nomes(lista: { name: string }[], total: number): string {
  const primeiros = lista.slice(0, 3).map((d) => d.name.split(' ')[0]);
  const resto = total - primeiros.length;
  return `${primeiros.join(', ')}${resto > 0 ? ` e mais ${resto}` : ''}`;
}

export function buildQueue(overview: ApiOverview): QueueItem[] {
  const { queue: q, finance } = overview;
  const items: QueueItem[] = [];

  // ── Resolver agora ─────────────────────────────────────────────────────────

  if (q.earningsPending.count > 0) {
    const d = daysSince(q.earningsPending.oldestAt);
    items.push({
      key: 'earnings',
      tier: 'resolve',
      icon: HandCoins,
      // Escrito por extenso em vez de passar pelo ajudante: "valor comunicado"
      // pluraliza nas duas palavras e com mudança de raiz, e forçá-lo no
      // plural() exigia um remendo com replace por cima do resultado.
      title: q.earningsPending.count === 1
        ? '1 valor comunicado por confirmar'
        : `${q.earningsPending.count} valores comunicados por confirmar`,
      detail: `O mais antigo ${ago(d)}`,
      waiting: d,
      count: q.earningsPending.count,
      panel: 'earnings',
    });
  }

  if (q.supportOpen.count > 0) {
    const d = daysSince(q.supportOpen.oldestAt);
    items.push({
      key: 'support',
      tier: 'resolve',
      icon: MessageCircle,
      title: `${q.supportOpen.count} ${plural(q.supportOpen.count, 'ticket')} de suporte em aberto`,
      detail: `O mais antigo ${ago(d)}`,
      waiting: d,
      count: q.supportOpen.count,
      panel: 'support',
    });
  }

  // O texto antigo dizia "Avise antes de o motorista parar" e o botão dizia
  // "Ver". O que a linha mandava fazer e o que o botão fazia eram coisas
  // diferentes. Agora avisa mesmo.
  if (q.documentsExpiringSoon.count > 0) {
    items.push({
      key: 'expiring',
      tier: 'resolve',
      icon: CalendarClock,
      title: `${q.documentsExpiringSoon.count} ${plural(q.documentsExpiringSoon.count, 'documento')} ${plural(q.documentsExpiringSoon.count, 'expira', 'm')} em ${q.documentsExpiringSoon.days} dias`,
      detail: 'Avise antes de o motorista ser bloqueado',
      waiting: null,
      count: q.documentsExpiringSoon.count,
      panel: 'expiring',
    });
  }

  // ── Precisa de abrir ───────────────────────────────────────────────────────

  // O fecho é o que faz o motorista receber: uma semana por fechar é uma semana
  // em que ninguém foi pago. Fica no topo do nível, sem idade — não é atraso de
  // dias, é a tarefa da semana.
  if (q.missingSettlements.count > 0) {
    items.push({
      key: 'settlements',
      tier: 'open',
      icon: ReceiptText,
      title: `${q.missingSettlements.count} ${plural(q.missingSettlements.count, 'motorista')} sem fecho da semana passada`,
      detail: nomes(q.missingSettlements.drivers, q.missingSettlements.count),
      waiting: null,
      count: q.missingSettlements.count,
      panel: 'settlements',
      drivers: q.missingSettlements.drivers,
      navState: {
        weekStart: q.missingSettlements.weekStart,
        weekEnd: q.missingSettlements.weekEnd,
      },
    });
  }

  if (q.withdrawalsPending.count > 0) {
    const d = daysSince(q.withdrawalsPending.oldestAt);
    items.push({
      key: 'withdrawals',
      tier: 'open',
      icon: Coins,
      title: `${q.withdrawalsPending.count} ${plural(q.withdrawalsPending.count, 'retirada')} ${plural(q.withdrawalsPending.count, 'pendente')}`,
      detail: `A mais antiga ${ago(d)}`,
      waiting: d,
      count: q.withdrawalsPending.count,
      panel: 'withdrawals',
    });
  }

  // Faltava na fila desde que a aprovação de IBAN foi construída. A ausência
  // tinha consequência: sem IBAN aprovado o motorista não pede retiradas, e
  // ninguém tinha motivo para abrir a aba do Financeiro à procura.
  if (q.bankPending && q.bankPending.count > 0) {
    const d = daysSince(q.bankPending.oldestAt);
    items.push({
      key: 'bank',
      tier: 'open',
      icon: Landmark,
      title: `${q.bankPending.count} ${plural(q.bankPending.count, 'IBAN')} por aprovar`,
      detail: `O mais antigo ${ago(d)} · sem aprovação não há retiradas`,
      waiting: d,
      count: q.bankPending.count,
      panel: 'bank',
    });
  }

  if (q.documentsPending.count > 0) {
    const d = daysSince(q.documentsPending.oldestAt);
    items.push({
      key: 'documents',
      tier: 'open',
      icon: FileText,
      title: `${q.documentsPending.count} ${plural(q.documentsPending.count, 'documento')} por rever`,
      detail: `O mais antigo ${ago(d)}`,
      waiting: d,
      count: q.documentsPending.count,
      panel: 'documents',
    });
  }

  // ── Para saber ─────────────────────────────────────────────────────────────

  if (finance.negativeDrivers.length > 0) {
    items.push({
      key: 'negative',
      tier: 'inform',
      icon: TrendingDown,
      title: `${finance.negativeDrivers.length} ${plural(finance.negativeDrivers.length, 'motorista')} com saldo negativo`,
      detail: 'Regulariza-se sozinho no próximo fecho positivo',
      waiting: null,
      count: finance.negativeDrivers.length,
      panel: 'drivers',
      drivers: finance.negativeDrivers,
    });
  }

  if (q.driversBlocked > 0) {
    items.push({
      key: 'blocked',
      tier: 'inform',
      icon: UserX,
      title: `${q.driversBlocked} ${plural(q.driversBlocked, 'motorista')} ${plural(q.driversBlocked, 'bloqueado')} por documentação`,
      detail: 'Não podem trabalhar até regularizar',
      waiting: null,
      count: q.driversBlocked,
      panel: 'drivers',
    });
  }

  return items;
}

/**
 * Quem espera há mais tempo primeiro; quem não tem idade vai para o fim.
 *
 * A ordenação é dentro de cada nível, não global: um ticket de há uma semana
 * não deve empurrar um fecho por fazer para baixo, porque são tarefas de
 * naturezas diferentes e o nível já as separou.
 */
export function sortQueue(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => (b.waiting ?? -1) - (a.waiting ?? -1));
}
