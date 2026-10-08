// src/app/components/admin/queue/WorkQueue.tsx
//
// A fila de trabalho: três blocos, e cada linha abre o ecrã que resolve.
//
// ─── O QUE MUDOU, E PORQUE ───────────────────────────────────────────────────
//
// Antes cada linha expandia um painel aqui dentro, com a sua própria lista e o
// seu próprio pedido ao servidor. Isso fazia do painel uma segunda versão de
// cada tela — com menos filtros, menos ordenação, e a mesma lógica a manter em
// dois sítios. Agora a linha navega.
//
// O painel passa a responder a uma pergunta só, que é a que vale a pena:
// "o que falta fazer, e onde". O trabalho faz-se onde já se fazia.
//
// ─── O NÚMERO E A COR ────────────────────────────────────────────────────────
//
// Cada linha leva o número de itens por trás dela e, quando está atrasada, o
// tom vermelho — o mesmo que aparece no menu lateral. É de propósito que seja
// o mesmo: quem vê um 3 vermelho no menu tem de reconhecer a linha vermelha do
// painel como sendo a mesma coisa.

import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { TIER_TITLES, type QueueItem, type QueueTier } from './types';

function QueueRow({ item }: { item: QueueItem }) {
  const navigate = useNavigate();
  const Icon = item.icon;
  const arde = item.late;

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => navigate(item.to, item.navState ? { state: item.navState } : undefined)}
        className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <Icon
          className={`h-[18px] w-[18px] shrink-0 ${arde ? 'text-destructive' : 'text-muted-foreground'}`}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{item.title}</p>
          <p className={`truncate text-xs ${arde ? 'text-destructive' : 'text-muted-foreground'}`}>
            {item.detail}
          </p>
        </div>

        {/* O número repetido ao lado da linha não é decoração: o título diz
            "3 documentos" e o número confirma-o no mesmo sítio onde o menu o
            mostra, que é o que liga as duas coisas aos olhos de quem lê. */}
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
            arde
              ? 'bg-destructive/10 text-destructive'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
          }`}
        >
          {item.count > 99 ? '99+' : item.count}
        </span>

        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

function TierBlock({ tier, items }: { tier: QueueTier; items: QueueItem[] }) {
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
          {items.map((item) => <QueueRow key={item.key} item={item} />)}
        </ul>
      </CardContent>
    </Card>
  );
}

export function WorkQueue({ items }: { items: QueueItem[] }) {
  const resolver = items.filter((i) => i.tier === 'resolve');
  const tratar = items.filter((i) => i.tier === 'open');
  const saber = items.filter((i) => i.tier === 'inform');

  // Nada a decidir nem a tratar. O estado bom merece uma resposta explícita:
  // metade do valor deste painel é saber que está tudo em dia sem ter de abrir
  // dez telas para confirmar.
  if (resolver.length === 0 && tratar.length === 0) {
    return (
      <>
        <Card className="shadow-card">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
            <p className="text-sm font-medium">Nada à espera</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Oficina, fechos, documentos, retiradas e suporte estão em dia.
            </p>
          </CardContent>
        </Card>
        <TierBlock tier="inform" items={saber} />
      </>
    );
  }

  return (
    <>
      <TierBlock tier="resolve" items={resolver} />
      <TierBlock tier="open" items={tratar} />
      <TierBlock tier="inform" items={saber} />
    </>
  );
}
