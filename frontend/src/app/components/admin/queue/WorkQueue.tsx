// src/app/components/admin/queue/WorkQueue.tsx
//
// A fila de trabalho: três níveis, linhas que abrem no sítio.
//
// ─── UMA EXPANDIDA DE CADA VEZ ───────────────────────────────────────────────
//
// Deliberado. Várias abertas ao mesmo tempo empurram o resto da fila para fora
// do ecrã e desfazem a razão de ser desta tela, que é ver tudo o que espera de
// uma vez. Uma de cada vez mantém a lista curta e obriga a acabar o que se
// começou antes de abrir o seguinte.
//
// ─── SEM CAMINHOS DIFERENTES POR TAMANHO DE ECRÃ ─────────────────────────────
//
// Foi considerado abrir a tela dedicada no telemóvel em vez de expandir. Não:
// seriam dois comportamentos a manter, e um deles quase nunca testado. Os
// painéis são desenhados para caber a 380px — as ações ficam sob o texto em vez
// de ao lado, e é a mesma marcação nos dois casos.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import { QueuePanel } from './panels';
import { OVERDUE_DAYS, TIER_TITLES, type QueueItem, type QueueTier } from './types';

function QueueRow({
  item, expanded, onToggle, expiringDays,
}: {
  item: QueueItem;
  expanded: boolean;
  onToggle: () => void;
  expiringDays: number;
}) {
  const Icon = item.icon;
  const atrasado = item.waiting !== null && item.waiting >= OVERDUE_DAYS;

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <Icon
          className={`h-[18px] w-[18px] shrink-0 ${atrasado ? 'text-destructive' : 'text-muted-foreground'}`}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{item.title}</p>
          <p className={`truncate text-xs ${atrasado ? 'text-destructive' : 'text-muted-foreground'}`}>
            {item.detail}
          </p>
        </div>

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Montado só quando aberto, e não escondido com CSS: cada painel faz o
          seu próprio pedido ao servidor, e mantê-los montados carregava as oito
          listas de uma vez sempre que o painel abrisse. */}
      {expanded && (
        <div className="pb-3 pl-[30px] pr-1">
          <QueuePanel item={item} expiringDays={expiringDays} />
        </div>
      )}
    </li>
  );
}

function TierBlock({
  tier, items, expanded, onToggle, expiringDays,
}: {
  tier: QueueTier;
  items: QueueItem[];
  expanded: string | null;
  onToggle: (key: string) => void;
  expiringDays: number;
}) {
  if (items.length === 0) return null;
  const { title, subtitle } = TIER_TITLES[tier];

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-4 sm:p-6">
        <div>
          <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? 'item' : 'itens'}
        </span>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        <ul>
          {items.map((item) => (
            <QueueRow
              key={item.key}
              item={item}
              expanded={expanded === item.key}
              onToggle={() => onToggle(item.key)}
              expiringDays={expiringDays}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function WorkQueue({ items, expiringDays }: { items: QueueItem[]; expiringDays: number }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((atual) => (atual === key ? null : key));

  const resolver = items.filter((i) => i.tier === 'resolve');
  const abrir = items.filter((i) => i.tier === 'open');
  const saber = items.filter((i) => i.tier === 'inform');

  // Nada a decidir nem a abrir. O estado bom merece uma resposta explícita:
  // metade do valor deste painel é saber que está tudo em dia sem verificar
  // cinco telas.
  if (resolver.length === 0 && abrir.length === 0) {
    return (
      <>
        <Card className="shadow-card">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
            <p className="text-sm font-medium">Nada à espera</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Fechos, documentos, retiradas e suporte estão em dia.
            </p>
          </CardContent>
        </Card>
        <TierBlock
          tier="inform" items={saber} expanded={expanded}
          onToggle={toggle} expiringDays={expiringDays}
        />
      </>
    );
  }

  return (
    <>
      <TierBlock tier="resolve" items={resolver} expanded={expanded} onToggle={toggle} expiringDays={expiringDays} />
      <TierBlock tier="open" items={abrir} expanded={expanded} onToggle={toggle} expiringDays={expiringDays} />
      <TierBlock tier="inform" items={saber} expanded={expanded} onToggle={toggle} expiringDays={expiringDays} />
    </>
  );
}
