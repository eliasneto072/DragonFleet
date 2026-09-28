// src/app/components/admin/expenses-queue.tsx
//
// Combustível e portagens que chegaram sem dono.
//
// Um movimento cai aqui quando o cartão e a matrícula são desconhecidos, ou
// quando o carro existe mas não estava atribuído a ninguém naquela hora. Não se
// perde: fica gravado, e daqui atribui-se à mão.
//
// Uma portagem que ninguém atribui é uma portagem que a empresa paga e não
// desconta. Por isso a fila aparece com a contagem na aba, e não escondida num
// menu.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import { FilterCombobox, type FilterOption } from '@/app/components/ui/filter-combobox';
import {
  expensesService, formatCardNumber, CATEGORY_LABELS, SOURCE_LABELS,
  type UnmatchedMovement,
} from '@/features/admin/services/expenses.service';
import { usersService } from '@/features/admin/services/users.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';

const hora = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
});

function diaCurto(dia: string): string {
  const [, m, d] = dia.slice(0, 10).split('-');
  return `${d}/${m}`;
}

function Linha({
  m, opcoes,
}: { m: UnmatchedMovement; opcoes: FilterOption[] }) {
  const queryClient = useQueryClient();
  const [escolhido, setEscolhido] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: (body: { userId?: string | null; chargeable?: boolean }) =>
      expensesService.updateMovement(m.id, body),
    onSuccess: (_r, body) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      if (body.userId) {
        const nome = opcoes.find((o) => o.value === body.userId)?.label ?? 'o motorista';
        toast.success(`Atribuído a ${nome}. Entra no fecho da semana de ${diaCurto(m.settlementWeek)}.`);
      }
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível atribuir.'),
  });

  const valor = Number(m.amount);

  return (
    <div className="grid gap-3 border-t border-border py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{m.description}</span>
          <span className={`text-sm font-semibold tabular-nums ${m.chargeable ? '' : 'text-muted-foreground line-through'}`}>
            {formatCurrency(valor)}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {SOURCE_LABELS[m.source]} · {CATEGORY_LABELS[m.category]} · {hora.format(new Date(m.occurredAt))}
          {m.statusText ? ` · ${m.statusText}` : ''}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {m.plate ? <>Matrícula <strong className="font-medium text-foreground">{m.plate}</strong></> : 'Sem matrícula'}
          {m.cardNumber && <> · cartão <span className="tabular-nums">{formatCardNumber(m.cardNumber)}</span></>}
          {' '}· fecho da semana de {diaCurto(m.settlementWeek)}
          {!m.chargeable && ' · não desconta'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterCombobox
          options={opcoes}
          value={escolhido}
          onChange={setEscolhido}
          placeholder="Escolher motorista"
          allLabel="Escolher motorista"
          allValue=""
          className="w-full sm:w-56"
          emptyLabel="Nenhum motorista com esse nome"
        />
        <Button
          size="sm"
          disabled={!escolhido || isPending}
          onClick={() => mutate({ userId: escolhido })}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Atribuir'}
        </Button>
        <Button
          size="sm" variant="ghost"
          disabled={isPending}
          onClick={() => mutate({ chargeable: !m.chargeable })}
          title={m.chargeable
            ? 'Fica na empresa: não se desconta a ninguém'
            : 'Voltar a descontar quando for atribuído'}
        >
          {m.chargeable ? 'Não descontar' : 'Descontar'}
        </Button>
      </div>
    </div>
  );
}

export function ExpensesQueue() {
  const q = useQuery({
    queryKey: queryKeys.expenses.unmatched,
    queryFn: () => expensesService.unmatched(),
  });

  const usersQ = useQuery({
    queryKey: queryKeys.users.allUnpaged,
    queryFn: () => usersService.listAll(),
    staleTime: 60_000,
  });

  const opcoes = useMemo<FilterOption[]>(() =>
    (usersQ.data?.users ?? [])
      .filter((u) => u.role === 'DRIVER' && u.status === 'ACTIVE')
      .sort((a, b) => a.name.localeCompare(b.name, 'pt'))
      // O email desambigua homónimos: atribuir ao "João Silva" errado desconta
      // a portagem a outra pessoa, sem aviso nenhum.
      .map((u) => ({ value: u.id, label: u.name, hint: u.email })),
  [usersQ.data]);

  const movimentos = q.data?.movements ?? [];
  const aDescontar = movimentos.filter((m) => m.chargeable).reduce((a, m) => a + Number(m.amount), 0);

  return (
    <div className="space-y-4">
      <p className="max-w-[70ch] text-sm text-muted-foreground">
        Combustível e portagens importados sem motorista: o cartão e a matrícula são
        desconhecidos, ou o carro não estava atribuído a ninguém naquela hora. Atribua-os aqui
        para entrarem no fecho. Se o carro ou o cartão deviam ser conhecidos, registe-os — os
        próximos envios já emparelham sozinhos.
      </p>

      <Card className="shadow-card">
        <CardContent className="p-4 sm:p-6">
          {q.isLoading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : q.isError ? (
            <p className="text-sm text-muted-foreground">
              Não foi possível ler a fila. {(q.error as any)?.message ?? ''}
            </p>
          ) : movimentos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">Nada por atribuir</p>
              <p className="text-xs text-muted-foreground">
                Todo o combustível e portagens importados têm motorista.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-2 text-sm">
                <strong className="font-semibold">{movimentos.length}</strong> movimento
                {movimentos.length !== 1 ? 's' : ''} por atribuir ·{' '}
                <strong className="font-semibold tabular-nums">{formatCurrency(aDescontar)}</strong> que
                ninguém está a pagar
              </p>
              {movimentos.map((m) => <Linha key={m.id} m={m} opcoes={opcoes} />)}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
