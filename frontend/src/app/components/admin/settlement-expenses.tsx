// src/app/components/admin/settlement-expenses.tsx
//
// O combustível e as portagens que a extensão importou, dentro do formulário do
// fecho, ao lado dos campos onde vão parar.
//
// ─── NADA ENTRA SOZINHO ──────────────────────────────────────────────────────
//
// O painel mostra e oferece; o administrador carrega em "Usar". Preencher os
// campos automaticamente seria mais rápido e esconderia o momento em que alguém
// devia olhar: um cartão mal associado ou um carro com a atribuição errada
// descontava a pessoa errada, e ninguém repararia até ela telefonar.
//
// ─── AS DUAS SEMANAS ─────────────────────────────────────────────────────────
//
// A Prio é da própria semana; a Via Verde, da anterior. O servidor já resolveu
// isso ao importar — cada movimento tem a semana de fecho gravada. Aqui só se
// mostra o intervalo de cada bloco, para ninguém estranhar portagens com datas
// de outra semana.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, Fuel, Loader2, Milestone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  expensesService, CATEGORY_LABELS,
  type ExpenseBlock, type ExpenseMovementLine,
} from '@/features/admin/services/expenses.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';

const hora = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

function diaCurto(dia: string): string {
  const [, m, d] = dia.split('-');
  return `${d}/${m}`;
}

function eSegunda(dia: string): boolean {
  const [a, m, d] = dia.split('-').map(Number);
  return !!a && new Date(Date.UTC(a, m - 1, d)).getUTCDay() === 1;
}

/** Os dois números batem? Cêntimo a cêntimo, com o campo vazio a valer zero. */
function mesmoValor(campo: string, importado: number): boolean {
  const n = campo.trim() === '' ? 0 : Number(campo);
  return Math.abs(n - importado) < 0.005;
}

interface Props {
  userId: string;
  weekStart: string;
  fuelValue: string;
  tollsValue: string;
  onUseFuel: (v: string) => void;
  onUseTolls: (v: string) => void;
}

export function SettlementExpenses({
  userId, weekStart, fuelValue, tollsValue, onUseFuel, onUseTolls,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const queryClient = useQueryClient();
  const segunda = eSegunda(weekStart);

  const q = useQuery({
    queryKey: queryKeys.expenses.forSettlement(userId, weekStart),
    queryFn: () => expensesService.forSettlement(userId, weekStart),
    enabled: !!userId && segunda,
  });

  const { mutate: alternar, variables: aMudar, isPending: mudando } = useMutation({
    mutationFn: (m: ExpenseMovementLine) =>
      expensesService.updateMovement(m.id, { chargeable: !m.chargeable }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all }),
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível mudar o movimento.'),
  });

  if (!userId) return null;

  const moldura = (conteudo: React.ReactNode) => (
    <div className="rounded-lg border border-border bg-secondary/60 p-3 sm:col-span-2">{conteudo}</div>
  );

  if (!segunda) {
    return moldura(
      <p className="text-xs text-muted-foreground">
        O combustível e as portagens importados estão organizados por semanas de segunda a
        domingo. Comece a semana numa segunda-feira para os ver aqui.
      </p>,
    );
  }

  if (q.isLoading) return moldura(<Skeleton className="h-14 w-full" />);

  if (q.isError) {
    return moldura(
      <p className="text-xs text-muted-foreground">
        Não foi possível ler as despesas importadas. {(q.error as any)?.message ?? ''}
      </p>,
    );
  }

  const d = q.data!;
  const total = d.fuel.movements.length + d.tolls.movements.length;

  if (total === 0) {
    return moldura(
      <p className="text-xs text-muted-foreground">
        Sem combustível nem portagens importados para este motorista nesta semana. Os valores
        da Prio e da Via Verde chegam pela extensão do browser.
      </p>,
    );
  }

  const usarAmbos = () => {
    onUseFuel(d.fuel.chargeableTotal ? String(d.fuel.chargeableTotal) : '');
    onUseTolls(d.tolls.chargeableTotal ? String(d.tolls.chargeableTotal) : '');
    toast.success('Valores importados copiados para os campos.');
  };

  const bloco = (
    titulo: string, fonte: string, icone: React.ReactNode, b: ExpenseBlock,
    campo: string, usar: (v: string) => void, nota?: string,
  ) => {
    const igual = mesmoValor(campo, b.chargeableTotal);
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
          {icone}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {titulo} <span className="font-normal text-muted-foreground">· {fonte}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {diaCurto(b.range.from)} a {diaCurto(b.range.to)}{nota ? ` · ${nota}` : ''} ·{' '}
            {b.movements.length} movimento{b.movements.length !== 1 ? 's' : ''}
            {!igual && campo.trim() !== '' && (
              <span className="text-amber-700 dark:text-amber-300">
                {' '}· no campo está {formatCurrency(Number(campo) || 0)}
              </span>
            )}
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums">{formatCurrency(b.chargeableTotal)}</span>
        <Button
          type="button" size="sm" variant={igual ? 'ghost' : 'outline'}
          disabled={igual || b.movements.length === 0}
          onClick={() => usar(b.chargeableTotal ? String(b.chargeableTotal) : '')}
        >
          {igual ? 'Em uso' : 'Usar'}
        </Button>
      </div>
    );
  };

  const linhas = [...d.fuel.movements, ...d.tolls.movements]
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  return moldura(
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Importado dos portais
        </p>
        <Button
          type="button" size="sm" variant="secondary"
          onClick={usarAmbos}
          disabled={mesmoValor(fuelValue, d.fuel.chargeableTotal) && mesmoValor(tollsValue, d.tolls.chargeableTotal)}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Usar os dois
        </Button>
      </div>

      <div className="divide-y divide-border">
        {bloco('Combustível', 'Prio', <Fuel className="h-4 w-4" aria-hidden="true" />,
          d.fuel, fuelValue, onUseFuel)}
        {bloco('Portagens', 'Via Verde', <Milestone className="h-4 w-4" aria-hidden="true" />,
          d.tolls, tollsValue, onUseTolls, 'semana anterior')}
      </div>

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="mt-2 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {aberto
          ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
        {aberto ? 'Esconder os movimentos' : 'Ver os movimentos'}
      </button>

      {aberto && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Desconta</th>
                <th className="py-1.5 pr-2 font-medium">Quando</th>
                <th className="py-1.5 pr-2 font-medium">O quê</th>
                <th className="py-1.5 pr-2 font-medium">Matrícula</th>
                <th className="py-1.5 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((m) => {
                const ocupado = mudando && aMudar?.id === m.id;
                return (
                  <tr key={m.id} className={`border-t border-border ${m.chargeable ? '' : 'text-muted-foreground'}`}>
                    <td className="py-1.5 pr-2">
                      {ocupado
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : (
                          <Checkbox
                            checked={m.chargeable}
                            onCheckedChange={() => alternar(m)}
                            aria-label={`Descontar ${m.description}`}
                          />
                        )}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums">{hora.format(new Date(m.occurredAt))}</td>
                    <td className="py-1.5 pr-2">
                      <span className={m.chargeable ? '' : 'line-through'}>{m.description}</span>
                      <span className="ml-1.5 text-muted-foreground">
                        {CATEGORY_LABELS[m.category]}
                        {m.statusText ? ` · ${m.statusText}` : ''}
                        {m.matchedBy === 'CARD' ? ' · pelo cartão' : m.matchedBy === 'MANUAL' ? ' · atribuído à mão' : ''}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-2">{m.plate ?? '—'}</td>
                    <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{formatCurrency(m.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            A mensalidade da Via Verde e os movimentos cancelados vêm desmarcados. Mudar uma
            linha muda o total acima; carregue em Usar para o levar para o campo.
          </p>
        </div>
      )}
    </>,
  );
}
