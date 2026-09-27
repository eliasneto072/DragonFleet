// src/app/components/admin/driver-ledger.tsx
//
// O extrato completo de um motorista, na ficha dele.
//
// ─── PORQUE É QUE ISTO SUBSTITUI O "HISTÓRICO DE AJUSTES" ───────────────────
//
// A ficha mostrava só os ajustes manuais. Os fechos semanais — que são a maior
// parte do dinheiro que lá entra — apareciam noutra tela, e os mosaicos do
// saldo nem os contavam: somar Ganhos + Créditos − Débitos − Levantado −
// Reservado NÃO dava o saldo disponível que estava mesmo por cima, e a
// diferença eram precisamente os fechos.
//
// Quem estava a olhar para a ficha não tinha como saber que faltava lá alguma
// coisa. Só dava para desconfiar fazendo a conta à mão e reparando que não
// batia — e foi assim que o problema que motivou este ecrã foi encontrado.
//
// ─── E PORQUE É QUE A ORDEM COMEÇA NO MAIS ANTIGO ──────────────────────────
//
// Ao contrário do extrato do motorista, que abre no mais recente porque é o
// que ele vem ver. Aqui a pergunta é outra: "isto bate certo?". E para
// responder a essa segue-se a coluna do saldo de cima para baixo, do primeiro
// movimento até hoje. Do mais recente para o mais antigo, a mesma coluna
// lê-se ao contrário e não se percebe nada. O botão troca, para quem só quer
// ver o que entrou esta semana.
//
// O saldo de cada linha vem do servidor (é o mesmo `GET /balance/:id/ledger`
// que o motorista lê) e não é recalculado aqui: dois sítios a somar o mesmo
// é um sítio a mais para discordarem.

import { useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownCircle, ArrowDownUp, ArrowUpCircle, MinusCircle,
  PiggyBank, PlusCircle, ReceiptText, Undo2,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  balanceService, type Adjustment, type LedgerEntry, type LedgerKind,
} from '@/features/admin/services/balance.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatDate } from '@/shared/lib/format';
import { AdjustmentEditDialog } from '@/app/components/admin/adjustment-edit-dialog';

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n);

const META: Record<LedgerKind, { icon: typeof PlusCircle; cls: string }> = {
  SETTLEMENT: { icon: ReceiptText,     cls: 'bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-300' },
  CREDIT:     { icon: PlusCircle,      cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
  DEBIT:      { icon: MinusCircle,     cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  WITHDRAWAL: { icon: ArrowDownCircle, cls: 'bg-muted text-muted-foreground' },
  INVESTMENT: { icon: PiggyBank,       cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  REDEMPTION: { icon: Undo2,           cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
};

export function DriverLedgerCard({ userId, ajustes = [] }: {
  userId: string;
  /** A lista de ajustes que a ficha já carrega: traz o autor e o motivo, que
   *  o extrato não tem, e é o que o diálogo de correção precisa. */
  ajustes?: Adjustment[];
}) {
  // Mesma chave que o resto da ficha: um ajuste novo ou uma retirada aprovada
  // já invalidam `balance.all`, e o extrato atualiza-se sem código extra.
  const q = useQuery({
    queryKey: queryKeys.balance.ledger(userId),
    queryFn: () => balanceService.getLedger(userId),
    enabled: !!userId,
  });

  const [antigoPrimeiro, setAntigoPrimeiro] = useState(true);
  const [verTudo, setVerTudo] = useState(false);
  const [aEditar, setAEditar] = useState<Adjustment | null>(null);

  const porId = new Map(ajustes.map((a) => [a.id, a]));

  if (q.isLoading) {
    return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }
  if (q.isError) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border py-6 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível carregar os movimentos.</p>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  const todos = q.data?.entries ?? [];
  if (!todos.length) {
    return (
      <p className="rounded-lg border py-4 text-center text-sm text-muted-foreground">
        Nenhum movimento registado.
      </p>
    );
  }

  const ordenados = antigoPrimeiro ? todos : [...todos].reverse();
  const LIMITE = 12;
  const visiveis = verTudo ? ordenados : ordenados.slice(0, LIMITE);
  const rec = q.data?.reconciliation;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Movimentos da conta</p>
        <Button
          variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => setAntigoPrimeiro((v) => !v)}
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
          {antigoPrimeiro ? 'Mais antigo primeiro' : 'Mais recente primeiro'}
        </Button>
      </div>

      <div className="space-y-2">
        {visiveis.map((e: LedgerEntry) => {
          const { icon: Icon, cls } = META[e.kind];
          // Só os ajustes manuais são corrigíveis aqui. A data de um fecho
          // está presa à semana (e alimenta níveis e projetos), e a de uma
          // retirada é o registo de quando o motorista a pediu.
          const ajuste = (e.kind === 'CREDIT' || e.kind === 'DEBIT')
            ? porId.get(e.id.replace(/^a:/, ''))
            : undefined;
          const autor = ajuste?.createdByName ?? undefined;

          return (
            <div
              key={e.id}
              className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                ajuste ? 'cursor-pointer transition-colors hover:bg-muted/50' : ''
              }`}
              {...(ajuste ? {
                role: 'button' as const,
                tabIndex: 0,
                onClick: () => setAEditar(ajuste),
                onKeyDown: (ev: KeyboardEvent) => {
                  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setAEditar(ajuste); }
                },
              } : {})}
            >
              <div className="flex min-w-0 gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cls}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.label}</p>
                  {e.detail && (
                    <p className="truncate text-xs text-muted-foreground">{e.detail}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatDate(e.date)}{autor ? ` · por ${autor}` : ''}
                    {ajuste?.editedAt ? ' · data corrigida' : ''}
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <p className={`text-sm font-semibold ${e.amount < 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                  {e.amount < 0 ? '−' : '+'}{eur(Math.abs(e.amount))}
                </p>
                {/* A coluna que responde à pergunta "isto bate certo?". */}
                <p className="text-xs text-muted-foreground">
                  ficou com {eur(e.balance)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {ordenados.length > LIMITE && (
        <Button
          variant="ghost" size="sm" className="mt-2 w-full text-xs"
          onClick={() => setVerTudo((v) => !v)}
        >
          {verTudo ? 'Ver menos' : `Ver todos os ${ordenados.length} movimentos`}
        </Button>
      )}

      {rec && (
        // Os três números juntos, porque a última linha do extrato NÃO é o
        // disponível: as retiradas por decidir ainda não estão lá dentro, e
        // sem esta caixa a diferença parecia um erro de contas.
        <div className="mt-3 space-y-1 rounded-lg border bg-muted/30 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Saldo em conta (última linha)</span>
            <span className="font-medium">{eur(rec.accountBalance)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reservado por pedidos por decidir</span>
            <span className="font-medium">− {eur(rec.pendingWithdrawals)}</span>
          </div>
          <div className="flex justify-between border-t pt-1">
            <span className="font-medium">Disponível para retirar</span>
            <span className="font-semibold">{eur(rec.availableToWithdraw)}</span>
          </div>
        </div>
      )}

      <p className="mt-2 flex items-start gap-1 text-xs text-muted-foreground">
        <ArrowUpCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        <span>
          Inclui fechos, ajustes, retiradas e investimentos — é o mesmo extrato que o
          motorista vê. Carregue num <strong>ajuste manual</strong> para lhe corrigir a data.
        </span>
      </p>

      {aEditar && (
        <AdjustmentEditDialog
          ajuste={aEditar}
          entries={todos}
          onClose={() => setAEditar(null)}
        />
      )}
    </div>
  );
}
