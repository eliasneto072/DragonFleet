// src/app/components/admin/generate-drafts-dialog.tsx
//
// "Gerar rascunhos da semana": do que a extensão importou a um fecho por
// registar, para todos os motoristas de uma vez.
//
// ─── MOSTRA ANTES DE FAZER ───────────────────────────────────────────────────
//
// Abre com a pré-visualização do servidor: quem vai ter rascunho, com que
// valores, e quanto fica para cada um. Só depois se carrega em Criar. Não é
// cerimónia — é o único momento em que se vê a semana inteira numa tabela, e
// um cartão mal associado salta à vista aqui antes de ir parar a um fecho.
//
// ─── O QUE NÃO FAZ ───────────────────────────────────────────────────────────
//
// Não regista. Os rascunhos aparecem na lista, e cada um é aberto, revisto e
// registado como qualquer outro. Não toca em quem já tem fecho na semana.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  settlementsService, type DraftSkipped,
} from '@/features/admin/services/settlements.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import { weekRange } from './settlement-form';

function eSegunda(dia: string): boolean {
  const [a, m, d] = dia.split('-').map(Number);
  return !!a && new Date(Date.UTC(a, m - 1, d)).getUTCDay() === 1;
}

function br(dia: string): string {
  return dia.split('-').reverse().join('/');
}

const MOTIVO: Record<DraftSkipped['status'], string> = {
  DRAFT: 'já tem um rascunho',
  REGISTERED: 'já tem o fecho registado',
  CANCELLED: 'tem um fecho cancelado nesta segunda-feira — apague-o para gerar um novo',
  EXISTS: 'foi criado um fecho entretanto',
};

/** Um valor, ou um traço quando é zero — a tabela lê-se melhor sem zeros. */
function V({ n }: { n: number }) {
  return n ? <>{formatCurrency(n)}</> : <span className="text-muted-foreground">—</span>;
}

export function GenerateDraftsDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(weekRange(-1).start);
  const segunda = eSegunda(weekStart);

  const q = useQuery({
    queryKey: [...queryKeys.settlements.all, 'drafts-preview', weekStart] as const,
    queryFn: () => settlementsService.draftsPreview(weekStart),
    enabled: open && segunda,
    // Sempre fresca: entre abrir e criar pode ter chegado mais um portal.
    staleTime: 0,
  });

  const { mutate: criar, isPending } = useMutation({
    mutationFn: () => settlementsService.generateDrafts(weekStart),
    onSuccess: ({ created, skipped }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settlements.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      toast.success(
        `${created.length} rascunho${created.length !== 1 ? 's' : ''} criado${created.length !== 1 ? 's' : ''}. ` +
        'Reveja e registe cada um.' +
        (skipped.length ? ` ${skipped.length} saltado${skipped.length !== 1 ? 's' : ''} por já ter fecho.` : ''),
      );
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível gerar os rascunhos.'),
  });

  const d = q.data;
  const linhas = d?.toCreate ?? [];
  const totais = linhas.reduce(
    (a, c) => ({
      uber: a.uber + c.uberAmount, bolt: a.bolt + c.boltAmount,
      fuel: a.fuel + c.fuelAmount, tolls: a.tolls + c.tollsAmount,
      fee: a.fee + c.vehicleFee, net: a.net + c.netToDriver,
    }),
    { uber: 0, bolt: 0, fuel: 0, tolls: 0, fee: 0, net: 0 },
  );

  const semana = (offset: number) => setWeekStart(weekRange(offset).start);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Gerar rascunhos da semana</DialogTitle>
          <DialogDescription>
            Um rascunho por motorista, com o que a extensão importou da Uber, da Bolt, da Prio e
            da Via Verde. Nada é creditado: cada rascunho é revisto e registado na lista.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="drafts-week">Semana a começar em</Label>
            <Input
              id="drafts-week" type="date" value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="w-44"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => semana(-1)}>Semana passada</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => semana(-2)}>Há duas semanas</Button>
          {segunda && d && (
            <p className="pb-1.5 text-xs text-muted-foreground">
              {br(d.weekStart)} a {br(d.weekEnd)} · comissão {d.commissionRate}% · imposto {d.taxRate}%
            </p>
          )}
        </div>

        {!segunda ? (
          <p className="text-sm text-muted-foreground">
            Escolha uma segunda-feira. As semanas de fecho vão de segunda a domingo, como nos portais.
          </p>
        ) : q.isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : q.isError ? (
          <p className="text-sm text-destructive">{(q.error as any)?.message ?? 'Não foi possível calcular.'}</p>
        ) : (
          <>
            {linhas.length === 0 ? (
              <p className="rounded-lg border border-border bg-secondary p-4 text-sm text-muted-foreground">
                Nenhum motorista sem fecho tem ganhos ou despesas importados nesta semana. Envie os
                portais com a extensão, ou escolha outra semana.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-secondary text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Motorista</th>
                      <th className="px-3 py-2 font-medium">Carro</th>
                      <th className="px-3 py-2 text-right font-medium">Uber</th>
                      <th className="px-3 py-2 text-right font-medium">Bolt</th>
                      <th className="px-3 py-2 text-right font-medium">Combustível</th>
                      <th className="px-3 py-2 text-right font-medium">Portagens</th>
                      <th className="px-3 py-2 text-right font-medium">Viatura</th>
                      <th className="px-3 py-2 text-right font-medium">Total da semana</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {linhas.map((c) => (
                      <tr key={c.userId} className="border-t border-border">
                        <td className="px-3 py-2">
                          {c.userName}
                          {c.otherRevenue > 0 && (
                            <span className="block text-xs text-muted-foreground">
                              + {formatCurrency(c.otherRevenue)} de outras plataformas
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {c.vehiclePlate ?? <span className="text-amber-700 dark:text-amber-300">sem carro</span>}
                          {c.otherPlates.length > 0 && (
                            <span className="block text-xs text-muted-foreground">
                              trocou; também {c.otherPlates.join(', ')}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right"><V n={c.uberAmount} /></td>
                        <td className="px-3 py-2 text-right"><V n={c.boltAmount} /></td>
                        <td className="px-3 py-2 text-right"><V n={c.fuelAmount} /></td>
                        <td className="px-3 py-2 text-right"><V n={c.tollsAmount} /></td>
                        <td className="px-3 py-2 text-right"><V n={c.vehicleFee} /></td>
                        <td className={`px-3 py-2 text-right font-semibold ${c.netToDriver < 0 ? 'text-destructive' : ''}`}>
                          {formatCurrency(c.netToDriver)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {linhas.length > 1 && (
                    <tfoot className="border-t-2 border-border font-semibold tabular-nums">
                      <tr>
                        <td className="px-3 py-2" colSpan={2}>{linhas.length} motoristas</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(totais.uber)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(totais.bolt)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(totais.fuel)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(totais.tolls)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(totais.fee)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(totais.net)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {(d?.skipped.length ?? 0) > 0 && (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                <div className="text-xs text-amber-800 dark:text-amber-200">
                  <p className="font-medium">Não mexo em quem já tem fecho nesta semana:</p>
                  <ul className="mt-1 space-y-0.5">
                    {d!.skipped.map((s) => (
                      <li key={s.userId}><strong className="font-medium">{s.userName}</strong> — {MOTIVO[s.status]}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {linhas.some((c) => !c.vehiclePlate) && (
              <p className="text-xs text-muted-foreground">
                "Sem carro": não havia atribuição nessa semana, e o rascunho sai sem a renda da
                viatura. Pode acrescentá-la ao rever.
              </p>
            )}
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            type="button"
            disabled={!segunda || isPending || linhas.length === 0}
            onClick={() => criar()}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {linhas.length > 0
              ? `Criar ${linhas.length} rascunho${linhas.length !== 1 ? 's' : ''}`
              : 'Criar rascunhos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
