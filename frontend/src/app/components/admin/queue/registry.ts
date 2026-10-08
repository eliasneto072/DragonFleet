// src/app/components/admin/queue/registry.ts
//
// Transforma os números do servidor nas linhas do painel.
//
// Dados puros, sem JSX: dá para ler a lista inteira de uma vez e perceber o
// que o painel mostra, sem atravessar renderização.
//
// ─── O SERVIDOR CONTA, O BROWSER ESCREVE ────────────────────────────────────
//
// `/pending` devolve chaves e contagens. As palavras — o plural, "espera há
// três dias", o nome do ecrã — são escritas aqui. Assim mudar um texto é um
// deploy do site e não do servidor, e o servidor não tem de saber pluralizar
// em português.
//
// ─── E OS CAMINHOS DOS MENUS TAMBÉM SÃO DAQUI ───────────────────────────────
//
// O servidor manda a ÁREA a que cada coisa pertence, não o endereço do ecrã.
// Endereços são do browser: um menu pode mudar de sítio sem tocar na API.
// Acrescentar uma fonte nova é uma entrada em `COMO_MOSTRAR` e mais nada.

import {
  AlertTriangle, CalendarClock, Car, Clock, Coins, FileText, HandCoins,
  Landmark, MessageCircle, Package, ReceiptText, TrendingDown, UserPlus,
  UserX, Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { QueueItem } from './types';
import type {
  PendingKey, PendingSource, PendingSummary,
} from '@/shared/services/pending.service';

/** Dias inteiros desde uma data, contados no relógio do servidor. */
function diasDesde(iso: string | null, agora: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((agora - t) / 86_400_000));
}

function espera(dias: number | null, feminino = false): string {
  if (dias === null) return '';
  const a = feminino ? 'A mais antiga' : 'O mais antigo';
  if (dias === 0) return `${a} chegou hoje`;
  if (dias === 1) return `${a} espera há 1 dia`;
  return `${a} espera há ${dias} dias`;
}

/** Plural simples: acrescenta `sufixo` quando `n` não é 1. */
function p(n: number, singular: string, sufixo = 's'): string {
  return n === 1 ? singular : `${singular}${sufixo}`;
}

function primeirosNomes(lista: { name: string }[] | undefined, total: number): string {
  if (!lista || lista.length === 0) return '';
  const primeiros = lista.slice(0, 3).map((d) => d.name.split(' ')[0]);
  const resto = total - primeiros.length;
  return `${primeiros.join(', ')}${resto > 0 ? ` e mais ${resto}` : ''}`;
}

interface ComoMostrar {
  icon: LucideIcon;
  /** O ecrã que resolve isto. */
  to: string;
  titulo: (f: PendingSource) => string;
  /** `dias` é a idade de quem espera há mais tempo, já calculada. */
  detalhe: (f: PendingSource, dias: number | null) => string;
  /** Pré-preenche ou filtra o ecrã de destino. */
  navState?: (f: PendingSource) => Record<string, unknown> | undefined;
}

/**
 * Como se mostra cada fonte.
 *
 * `remindersDue` não está aqui de propósito: os lembretes já têm o cartão
 * deles no painel, logo abaixo desta fila. Uma linha a dizer "2 lembretes" que
 * levasse ao painel onde já se está seria um clique para nada. Continuam a
 * contar para o número do menu — ver `fontes.ts` no servidor.
 */
const COMO_MOSTRAR: Partial<Record<PendingKey, ComoMostrar>> = {
  // ── Oficina ──────────────────────────────────────────────────────────────
  bookingsPropostas: {
    icon: Clock,
    to: '/app/admin/oficina',
    titulo: (f) => f.count === 1
      ? '1 marcação com hora nova proposta'
      : `${f.count} marcações com hora nova proposta`,
    detalhe: (_f, d) => `A oficina contrapôs — alguém tem de aceitar. ${espera(d, true)}`,
  },

  bookingsSemAcompanhante: {
    icon: UserPlus,
    to: '/app/admin/oficina',
    titulo: (f) => `${f.count} ${p(f.count, 'motorista')} à espera de acompanhamento`,
    detalhe: (_f, d) => `Pediu alguém da empresa e ninguém foi designado. ${espera(d)}`,
  },

  bookingsPorConcluir: {
    icon: Wrench,
    to: '/app/admin/oficina',
    titulo: (f) => f.count === 1
      ? '1 marcação já passou e não foi fechada'
      : `${f.count} marcações já passaram e não foram fechadas`,
    // É aqui que o custo da reparação se perde: sem fechar, não há custo nem
    // factura, e o carro fica a parecer mais barato do que é.
    detalhe: () => 'Feche com o que custou e a factura',
  },

  bookingsPendentes: {
    icon: Wrench,
    to: '/app/admin/oficina',
    titulo: (f) => `${f.count} ${p(f.count, 'marcação', 'ões')} à espera da oficina`,
    detalhe: (_f, d) => `Nada a fazer deste lado. ${espera(d, true)}`,
  },

  inspections: {
    icon: CalendarClock,
    to: '/app/admin/fleet',
    titulo: (f) => {
      const fora = f.extra?.overdue ?? 0;
      if (fora > 0) {
        return fora === 1
          ? '1 carro com a inspeção FORA DE PRAZO'
          : `${fora} carros com a inspeção FORA DE PRAZO`;
      }
      return `${f.count} ${p(f.count, 'inspeção', 'ões')} a chegar ao fim`;
    },
    detalhe: (f) => {
      const fora = f.extra?.overdue ?? 0;
      const restantes = f.count - fora;
      if (fora > 0) {
        return restantes > 0
          ? `Não podem circular. Mais ${restantes} ${p(restantes, 'a expirar')} nos próximos ${f.extra?.days ?? 30} dias`
          : 'Não podem circular até serem inspecionados';
      }
      return `Nos próximos ${f.extra?.days ?? 30} dias. Marque antes de o carro ficar parado`;
    },
  },

  // ── Frota ────────────────────────────────────────────────────────────────
  vehiclesPending: {
    icon: Car,
    to: '/app/admin/fleet',
    titulo: (f) => `${f.count} ${p(f.count, 'carro')} por ativar`,
    detalhe: (_f, d) => `Sem ativação não podem ser atribuídos. ${espera(d)}`,
  },

  materialsLow: {
    icon: Package,
    to: '/app/admin/material',
    titulo: (f) => `${f.count} ${p(f.count, 'material', 'is')} abaixo do mínimo`,
    detalhe: () => 'Comprar antes de ser preciso e não haver',
  },

  // ── Dinheiro ─────────────────────────────────────────────────────────────
  withdrawalsPending: {
    icon: Coins,
    to: '/app/admin/financial',
    titulo: (f) => `${f.count} ${p(f.count, 'retirada')} ${p(f.count, 'pendente')}`,
    detalhe: (_f, d) => espera(d, true),
  },

  bankPending: {
    icon: Landmark,
    to: '/app/admin/financial',
    titulo: (f) => `${f.count} IBAN ${p(f.count, 'por aprovar', '')}`,
    detalhe: (_f, d) => `Sem aprovação o motorista não pede retiradas. ${espera(d)}`,
  },

  scheduledLate: {
    icon: CalendarClock,
    to: '/app/admin/agendamentos',
    titulo: (f) => `${f.count} ${p(f.count, 'agendamento')} com data vencida`,
    // Não há coluna de erro nos agendamentos: uma data vencida e não lançada é
    // a forma de saber que o trabalho da noite não correu.
    detalhe: () => 'Deviam já ter sido lançados — convém verificar',
  },

  negativeDrivers: {
    icon: TrendingDown,
    to: '/app/admin/financial',
    titulo: (f) => `${f.count} ${p(f.count, 'motorista')} com saldo negativo`,
    detalhe: () => 'Regulariza-se sozinho no próximo fecho positivo',
  },

  // ── Faturação ────────────────────────────────────────────────────────────
  earningsPending: {
    icon: HandCoins,
    to: '/app/admin/settlements',
    titulo: (f) => f.count === 1
      ? '1 valor comunicado por confirmar'
      : `${f.count} valores comunicados por confirmar`,
    detalhe: (_f, d) => espera(d),
  },

  missingSettlements: {
    icon: ReceiptText,
    to: '/app/admin/settlements',
    titulo: (f) => `${f.count} ${p(f.count, 'motorista')} sem fecho da semana passada`,
    // Sem idade: não é atraso de dias, é a tarefa da semana.
    detalhe: (f) => primeirosNomes(f.extra?.drivers, f.count)
      || 'Sem fecho, ninguém recebe',
    navState: (f) => (f.extra?.weekStart
      ? { weekStart: f.extra.weekStart, weekEnd: f.extra.weekEnd }
      : undefined),
  },

  // ── Documentos ───────────────────────────────────────────────────────────
  documentsPending: {
    icon: FileText,
    to: '/app/admin/documents',
    titulo: (f) => `${f.count} ${p(f.count, 'documento')} por rever`,
    detalhe: (_f, d) => espera(d),
  },

  documentsExpiring: {
    icon: AlertTriangle,
    to: '/app/admin/documents',
    titulo: (f) => `${f.count} ${p(f.count, 'documento')} ${p(f.count, 'expira', 'm')} em ${f.extra?.days ?? 7} dias`,
    detalhe: () => 'Avise antes de o motorista ser bloqueado',
  },

  // ── Resto ────────────────────────────────────────────────────────────────
  supportOpen: {
    icon: MessageCircle,
    to: '/app/admin/support',
    titulo: (f) => `${f.count} ${p(f.count, 'ticket')} de suporte em aberto`,
    detalhe: (_f, d) => espera(d),
  },

  investorWithdrawals: {
    icon: Landmark,
    to: '/app/admin/investors',
    titulo: (f) => `${f.count} ${p(f.count, 'pedido')} de resgate por decidir`,
    detalhe: (_f, d) => espera(d),
  },

  driversBlocked: {
    icon: UserX,
    to: '/app/admin/drivers',
    titulo: (f) => `${f.count} ${p(f.count, 'motorista')} ${p(f.count, 'bloqueado')} por documentação`,
    detalhe: () => 'Não podem trabalhar até regularizar',
  },
};

/**
 * As linhas do painel, já ordenadas por quem espera há mais tempo.
 *
 * Uma fonte sem entrada em `COMO_MOSTRAR` é ignorada em silêncio, e isso é
 * deliberado: o servidor pode ganhar uma fonte nova antes de o site saber
 * desenhá-la, e o painel a rebentar por isso era pior do que o painel a não
 * mostrar uma linha.
 */
export function buildQueue(pending: PendingSummary): QueueItem[] {
  const agora = new Date(pending.now).getTime() || Date.now();

  const itens = pending.sources.flatMap((f): QueueItem[] => {
    const como = COMO_MOSTRAR[f.key];
    if (!como || f.count <= 0) return [];

    const dias = diasDesde(f.oldestAt, agora);

    return [{
      key: f.key,
      tier: f.nivel,
      icon: como.icon,
      title: como.titulo(f),
      detail: como.detalhe(f, dias).trim(),
      waiting: dias,
      count: f.count,
      late: f.late,
      to: como.to,
      navState: como.navState?.(f),
    }];
  });

  // Quem espera há mais tempo primeiro; quem não tem idade vai para o fim. A
  // ordenação é dentro de cada nível — os níveis desenham-se em blocos.
  return itens.sort((a, b) => (b.waiting ?? -1) - (a.waiting ?? -1));
}
