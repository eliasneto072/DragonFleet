// src/app/components/ui/document-status.tsx
//
// Ponto único de verdade para o estado de um documento.
//
// Antes existiam duas cópias divergentes de getStatusBadge — uma em
// documents-management.tsx e outra em vehicle-documents.tsx — com rótulos
// diferentes para o mesmo estado ("Pendente" vs "Em análise").
//
// O estado MISSING não existe no backend: representa um slot obrigatório que
// o motorista ainda não preencheu. As telas iteram sobre os tipos exigidos, e
// não sobre os documentos existentes, para que o que falta seja visível.
//
// As variantes dark: são obrigatórias. bg-*-100 com text-*-800 não invertem
// sozinhas e no modo escuro dariam texto escuro sobre fundo claro.

import {
  CheckCircle, Clock, XCircle, CalendarClock, CircleDashed,
} from 'lucide-react';
import type { DocumentStatus } from '@/shared/types/api';

/** Estados do backend mais o slot por preencher. */
export type DocumentSlotState = DocumentStatus | 'MISSING';

interface StateMeta {
  label: string;
  icon: typeof CheckCircle;
  /** Cor do ícone na lista. */
  iconCls: string;
  /** Fundo + texto do badge. */
  badgeCls: string;
  /**
   * Ordem de apresentação: menor aparece primeiro. O que exige ação do
   * motorista sobe ao topo — hoje a lista segue a ordem devolvida pela API,
   * e um documento rejeitado pode ficar abaixo de dois aprovados.
   */
  priority: number;
  /** True quando o motorista precisa fazer algo. */
  needsAction: boolean;
}

export const DOCUMENT_STATE_META: Record<DocumentSlotState, StateMeta> = {
  REJECTED: {
    label: 'Rejeitado',
    icon: XCircle,
    iconCls: 'text-destructive',
    badgeCls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    priority: 0,
    needsAction: true,
  },
  EXPIRED: {
    label: 'Expirado',
    icon: CalendarClock,
    iconCls: 'text-amber-600 dark:text-amber-400',
    badgeCls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    priority: 1,
    needsAction: true,
  },
  MISSING: {
    label: 'Ainda não enviado',
    icon: CircleDashed,
    iconCls: 'text-muted-foreground',
    badgeCls: 'bg-secondary text-muted-foreground',
    priority: 2,
    needsAction: true,
  },
  PENDING: {
    label: 'Em análise',
    icon: Clock,
    iconCls: 'text-amber-600 dark:text-amber-400',
    badgeCls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    priority: 3,
    needsAction: false,
  },
  APPROVED: {
    label: 'Aprovado',
    icon: CheckCircle,
    iconCls: 'text-success',
    badgeCls: 'bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-300',
    priority: 4,
    needsAction: false,
  },
};

export function documentStateMeta(state: DocumentSlotState): StateMeta {
  return DOCUMENT_STATE_META[state] ?? DOCUMENT_STATE_META.MISSING;
}

/** Ícone de estado para listas densas. O rótulo vai no texto ao lado. */
export function DocumentStatusIcon({
  state,
  className = '',
}: {
  state: DocumentSlotState;
  className?: string;
}) {
  const meta = documentStateMeta(state);
  const Icon = meta.icon;
  return (
    <>
      <Icon
        className={`shrink-0 ${meta.iconCls} ${className || 'h-4.5 w-4.5'}`}
        aria-hidden="true"
      />
      <span className="sr-only">{meta.label}:</span>
    </>
  );
}

/** Badge com fundo, para quando o estado precisa de destaque próprio. */
export function DocumentStatusBadge({ state }: { state: DocumentSlotState }) {
  const meta = documentStateMeta(state);
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badgeCls}`}
    >
      <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
