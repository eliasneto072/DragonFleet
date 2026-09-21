// src/app/components/driver/account-movements.tsx
//
// Os movimentos da conta, vistos pelo motorista.
//
// Pedido do cliente: os motoristas não sabiam quanto tinham antes de cada fecho,
// e quando a gestão fazia um ajuste só recebiam uma notificação que não abria
// nada. Queriam um registo onde se carrega, como nos fechos, e que mostre o
// saldo antes e o saldo depois.
//
// ─── DE ONDE VEM O NÚMERO ────────────────────────────────────────────────────
//
// Do extrato que a administração já usa (GET /balance/:userId/ledger). O
// backend deixa o dono ler o próprio extrato, portanto não houve nada a mudar
// do lado do servidor, e os dois lados veem exatamente o mesmo número em cada
// linha. Fazer aqui uma segunda conta seria criar um segundo número que, mais
// cedo ou mais tarde, deixaria de bater com o do escritório.
//
// ─── "SALDO EM CONTA" E NÃO "DISPONÍVEL" ─────────────────────────────────────
//
// O extrato não subtrai as retiradas PENDENTES (podem ainda ser recusadas). O
// cartão verde do painel subtrai. Quando há pendentes, os dois números diferem
// exatamente pelo valor delas, e a tela diz isso por escrito — um número que
// não bate sem explicação é precisamente o telefonema que isto quer evitar.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  ArrowDownToLine, CalendarCheck, ChevronRight, MinusCircle, PlusCircle,
} from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';
import {
  balanceService, type LedgerEntry, type LedgerKind, type LedgerReconciliation,
} from '@/features/admin/services/balance.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';

// ── Dados ─────────────────────────────────────────────────────────────────────

/** O extrato do próprio motorista. Partilha a chave com a administração, por
 *  isso qualquer invalidação de `balance.all` (fecho, ajuste, retirada) o
 *  atualiza sem código extra. */
export function useMyLedger() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.balance.ledger(user?.id ?? ''),
    queryFn: () => balanceService.getLedger(user!.id),
    enabled: !!user?.id,
  });
}

/** O saldo imediatamente antes de um movimento. O extrato só guarda o depois;
 *  o antes é o depois menos o próprio movimento. */
export function balanceBefore(entry: LedgerEntry): number {
  return Math.round((entry.balance - entry.amount) * 100) / 100;
}

// ── Rótulos ───────────────────────────────────────────────────────────────────

const KIND_META: Record<LedgerKind, {
  title: string;
  icon: typeof PlusCircle;
  iconCls: string;
}> = {
  SETTLEMENT: {
    title: 'Fecho semanal',
    icon: CalendarCheck,
    iconCls: 'text-brand-700 dark:text-emerald-300',
  },
  CREDIT: {
    title: 'Crédito na conta',
    icon: PlusCircle,
    iconCls: 'text-brand-700 dark:text-emerald-300',
  },
  DEBIT: {
    title: 'Desconto na conta',
    icon: MinusCircle,
    iconCls: 'text-destructive',
  },
  WITHDRAWAL: {
    title: 'Retirada',
    icon: ArrowDownToLine,
    iconCls: 'text-muted-foreground',
  },
};

/** "2026-09-05T14:03:00.000Z" → "05/09/2026". Os fechos trazem dia puro
 *  (meia-noite UTC) e cortar a string evita que um fuso negativo mostre a
 *  véspera; os ajustes trazem hora, e aí o dia UTC é o mesmo que em Lisboa
 *  exceto na última hora do dia — aceitável para uma linha de extrato. */
function dayOf(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/');
}

/** O texto principal de cada linha: para o fecho, a semana; para os outros, o
 *  tipo. O `label` do backend ("Crédito manual") é linguagem de escritório. */
function lineTitle(e: LedgerEntry): string {
  if (e.kind === 'SETTLEMENT' && e.detail) {
    const [from, to] = e.detail.split(' a ');
    if (from && to) return `Semana de ${dayOf(from)} a ${dayOf(to)}`;
  }
  if (e.kind === 'WITHDRAWAL') return e.label; // "Retirada paga" / "aprovada"
  return KIND_META[e.kind].title;
}

function signed(amount: number): string {
  return `${amount >= 0 ? '+' : '−'} ${formatCurrency(Math.abs(amount))}`;
}

// ── Saldo antes / depois ──────────────────────────────────────────────────────

/**
 * O bloco que o cliente pediu: quanto tinha, o que mexeu, com quanto ficou.
 * Usado no detalhe do fecho e no detalhe de um ajuste, para os dois dizerem a
 * mesma coisa da mesma maneira.
 */
export function BalanceBeforeAfter({
  entry, reconciliation, movementLabel,
}: {
  entry: LedgerEntry;
  reconciliation?: LedgerReconciliation;
  movementLabel: string;
}) {
  const before = balanceBefore(entry);
  const pending = reconciliation?.pendingWithdrawals ?? 0;

  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Saldo em conta
      </p>
      <dl>
        <div className="flex items-baseline justify-between gap-4 py-1">
          <dt className="text-muted-foreground">Tinha antes</dt>
          <dd className={`shrink-0 tabular-nums ${before < 0 ? 'text-destructive' : ''}`}>
            {formatCurrency(before)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-1">
          <dt className="text-muted-foreground">{movementLabel}</dt>
          <dd className={`shrink-0 tabular-nums ${entry.amount < 0 ? 'text-destructive' : ''}`}>
            {signed(entry.amount)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-border py-1">
          <dt className="font-medium">Ficou com</dt>
          <dd className={`shrink-0 font-semibold tabular-nums ${entry.balance < 0 ? 'text-destructive' : ''}`}>
            {formatCurrency(entry.balance)}
          </dd>
        </div>
      </dl>
      {pending > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          O saldo em conta não desconta as retiradas ainda em análise
          ({formatCurrency(pending)}). Se forem recusadas, o dinheiro fica na conta.
        </p>
      )}
    </div>
  );
}

// ── Detalhe de um movimento que não é fecho ───────────────────────────────────

export function MovementDetailDialog({
  entry, reconciliation, onClose,
}: {
  entry: LedgerEntry | null;
  reconciliation?: LedgerReconciliation;
  onClose: () => void;
}) {
  const meta = entry ? KIND_META[entry.kind] : null;

  return (
    <Dialog open={!!entry} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{entry ? lineTitle(entry) : ''}</DialogTitle>
          <DialogDescription>
            {entry?.kind === 'CREDIT' && 'Valor adicionado à sua conta pelo escritório'}
            {entry?.kind === 'DEBIT' && 'Valor descontado da sua conta pelo escritório'}
            {entry?.kind === 'WITHDRAWAL' && 'Dinheiro que saiu da conta para o seu IBAN'}
            {entry?.kind === 'SETTLEMENT' && 'Resultado da semana creditado na conta'}
          </DialogDescription>
        </DialogHeader>

        {entry && meta && (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">{dayOf(entry.date)}</p>

            {(entry.kind === 'CREDIT' || entry.kind === 'DEBIT') && (
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs font-medium text-muted-foreground">Motivo indicado pelo escritório</p>
                <p className="mt-1 whitespace-pre-line">
                  {entry.detail?.trim() || 'Sem motivo indicado.'}
                </p>
              </div>
            )}

            <BalanceBeforeAfter
              entry={entry}
              reconciliation={reconciliation}
              movementLabel={
                entry.kind === 'CREDIT' ? 'Crédito'
                  : entry.kind === 'DEBIT' ? 'Desconto'
                  : entry.kind === 'WITHDRAWAL' ? 'Retirada'
                  : 'Este fecho'
              }
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── A lista ───────────────────────────────────────────────────────────────────

const PREVIEW = 8;

/**
 * "Movimentos da conta" no painel. Cada linha abre o detalhe: os fechos abrem o
 * detalhe da semana que já existia (agora com o saldo antes e depois), os
 * restantes abrem o `MovementDetailDialog`.
 */
export function AccountMovementsCard({
  onOpenSettlement, onOpenMovement,
}: {
  onOpenSettlement: (settlementId: string) => void;
  onOpenMovement: (entry: LedgerEntry) => void;
}) {
  const ledgerQuery = useMyLedger();
  const [showAll, setShowAll] = useState(false);

  // Mais recente primeiro: é o que se procura ao abrir. O saldo de cada linha
  // continua a ser o acumulado cronológico que veio do servidor.
  const entries = [...(ledgerQuery.data?.entries ?? [])].reverse();
  const visible = showAll ? entries : entries.slice(0, PREVIEW);

  return (
    <Card className="shadow-card">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg">Movimentos da conta</CardTitle>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Tudo o que entrou e saiu, e com quanto ficou depois de cada movimento
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        {ledgerQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : ledgerQuery.isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">Não foi possível carregar os movimentos.</p>
            <Button variant="outline" size="sm" onClick={() => ledgerQuery.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Ainda não há movimentos na conta.
          </p>
        ) : (
          <>
            <ul>
              {visible.map((e) => {
                const meta = KIND_META[e.kind];
                const Icon = meta.icon;
                return (
                  <li key={e.id} className="border-b border-border py-1 last:border-0">
                    <button
                      type="button"
                      onClick={() =>
                        e.kind === 'SETTLEMENT' && e.settlementId
                          ? onOpenSettlement(e.settlementId)
                          : onOpenMovement(e)
                      }
                      className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-muted/40"
                    >
                      <Icon className={`h-5 w-5 shrink-0 ${meta.iconCls}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{lineTitle(e)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {dayOf(e.date)}
                          {(e.kind === 'CREDIT' || e.kind === 'DEBIT') && e.detail?.trim()
                            ? ` · ${e.detail}`
                            : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span
                          className={`block text-sm font-semibold tabular-nums ${
                            e.amount < 0 ? 'text-destructive' : 'text-foreground'
                          }`}
                        >
                          {signed(e.amount)}
                        </span>
                        <span className="block text-xs tabular-nums text-muted-foreground">
                          Ficou com {formatCurrency(e.balance)}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>

            {entries.length > PREVIEW && (
              <Button
                variant="ghost" size="sm" className="mt-2 w-full"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Mostrar menos' : `Ver todos (${entries.length})`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Ligação a partir das notificações ─────────────────────────────────────────

/**
 * O que uma notificação pede ao painel para abrir.
 *
 * As notificações não guardam a que movimento se referem (a tabela só tem
 * título e mensagem), por isso a ligação faz-se pelo que a mensagem diz:
 *
 *  - "Fecho semanal disponível" traz a semana ("Semana de 07/09/2026 a …"),
 *    que identifica o fecho sem ambiguidade — só há um fecho por semana.
 *  - "Crédito adicionado…" / "Débito aplicado…" trazem o valor; procura-se o
 *    ajuste desse tipo e valor com a data mais próxima da notificação (são
 *    criados no mesmo pedido, com milissegundos de diferença).
 *
 * Se nada corresponder (um ajuste entretanto corrigido, por exemplo), o painel
 * abre na mesma e o motorista vê a lista de movimentos.
 */
export type MovementLink =
  | { kind: 'SETTLEMENT'; weekStart: string }
  | { kind: 'CREDIT' | 'DEBIT'; amount: number; at: string };

export function linkFromNotification(n: {
  title: string; message: string; createdAt: string;
}): MovementLink | null {
  const title = n.title.toLowerCase();

  if (title.startsWith('fecho semanal')) {
    const m = n.message.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    return { kind: 'SETTLEMENT', weekStart: `${m[3]}-${m[2]}-${m[1]}` };
  }

  const isCredit = title.startsWith('crédito adicionado');
  const isDebit = title.startsWith('débito aplicado');
  if (isCredit || isDebit) {
    // "+€27217.64 — motivo". O valor é escrito com toFixed(2), ponto decimal.
    const m = n.message.match(/€\s?(\d+(?:\.\d{1,2})?)/);
    if (!m) return null;
    return { kind: isCredit ? 'CREDIT' : 'DEBIT', amount: Number(m[1]), at: n.createdAt };
  }

  return null;
}

/** Encontra no extrato o ajuste a que uma notificação de crédito/débito se refere. */
export function findAdjustment(
  entries: LedgerEntry[],
  link: { kind: 'CREDIT' | 'DEBIT'; amount: number; at: string },
): LedgerEntry | null {
  const target = new Date(link.at).getTime();
  let best: LedgerEntry | null = null;
  let bestDiff = Infinity;
  for (const e of entries) {
    if (e.kind !== link.kind) continue;
    if (Math.abs(Math.abs(e.amount) - link.amount) > 0.005) continue;
    const diff = Math.abs(new Date(e.date).getTime() - target);
    if (diff < bestDiff) { best = e; bestDiff = diff; }
  }
  // Mais de um dia de distância já não é "o mesmo pedido"; melhor não abrir
  // nada do que abrir o ajuste errado.
  return bestDiff <= 24 * 60 * 60 * 1000 ? best : null;
}
