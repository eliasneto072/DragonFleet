// src/app/components/admin/adjustment-edit-dialog.tsx
//
// Corrigir a data de um ajuste manual, sem ir à base de dados.
//
// ─── O CASO QUE ISTO RESOLVE ────────────────────────────────────────────────
//
// O saldo de abertura de um motorista ("o que ele já tinha em banca") é
// lançado como ajuste manual no dia em que alguém se lembra — e esse dia é
// quase sempre DEPOIS dos primeiros fechos semanais já registados. No extrato
// ele aparece a meio, e todas as linhas antes dele mostram um saldo corrido
// que não é o que o motorista tinha.
//
// O total nunca esteve errado: a view `driver_balances` soma sem olhar a
// datas. O que estava errado era a ordem — e a ordem é o que torna o extrato
// legível.
//
// Até aqui isto arranjava-se com um UPDATE à mão na base de dados de
// produção. Um comando escrito à pressa, sem transação, num sítio onde um
// WHERE a mais apaga o mês inteiro.
//
// ─── O QUE NÃO SE EDITA AQUI ────────────────────────────────────────────────
//
// O valor e o tipo. Mudá-los mudaria o saldo sem deixar rasto — o extrato
// passava a mostrar outro número e não haveria nada a dizer que ali esteve
// outro. Um valor errado corrige-se com um ajuste contrário: fica a linha
// errada, fica a correção, e a soma fica certa. É como se corrige dinheiro em
// qualquer lado.
//
// ─── A PRÉ-VISUALIZAÇÃO ─────────────────────────────────────────────────────
//
// Escolher uma data não diz onde o movimento vai cair — é preciso ter o
// extrato todo na cabeça. Por isso o ecrã diz em texto qual vai ser a posição
// nova ("passa a ser o 1.º de 7") antes de se gravar, e há um botão que põe a
// data um dia antes de tudo o resto, que é o que se quer em nove casos em dez.

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  balanceService, type Adjustment, type LedgerEntry,
} from '@/features/admin/services/balance.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { ApiError } from '@/shared/lib/api-client';

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n);

/** ISO → "2026-09-07", que é o que o <input type="date"> aceita. */
function paraCampo(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * "2026-09-07" → ISO, guardando a HORA do movimento original.
 *
 * O campo só pede o dia porque é só o dia que interessa para a ordem. Mas pôr
 * a hora a zero mudava o desempate entre movimentos do mesmo dia — e esse
 * desempate decide qual das duas linhas aparece primeiro.
 *
 * TUDO EM UTC, aqui e no `paraCampo`. Com `setFullYear` (que é local) e
 * `toISOString` (que é UTC), um movimento gravado às 23:30 UTC aparecia no
 * campo como dia 13 e, ao gravar sem lhe tocar, voltava como dia 12 — o
 * movimento recuava um dia sozinho em qualquer fuso a leste de Greenwich,
 * Lisboa no verão incluída.
 */
function paraIso(dia: string, originalIso: string): string {
  const [ano, mes, d] = dia.split('-').map(Number);
  const nova = new Date(originalIso);
  nova.setUTCFullYear(ano, mes - 1, d);
  return nova.toISOString();
}

/** Que posição (1-based) este movimento passaria a ocupar com a data nova. */
function posicaoCom(entries: LedgerEntry[], idNoExtrato: string, novaIso: string): number {
  const outros = entries.filter((e) => e.id !== idNoExtrato);
  const antes = outros.filter((e) => e.date < novaIso).length;
  return antes + 1;
}

export function AdjustmentEditDialog({ ajuste, entries, onClose }: {
  ajuste: Adjustment;
  /** O extrato inteiro, para a pré-visualização e para o botão do "antes de tudo". */
  entries: LedgerEntry[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [dia, setDia] = useState(() => paraCampo(ajuste.createdAt));
  const [motivo, setMotivo] = useState(ajuste.reason ?? '');

  const idNoExtrato = `a:${ajuste.id}`;
  const novaIso = dia ? paraIso(dia, ajuste.createdAt) : ajuste.createdAt;

  const total = entries.length;
  const posicaoAtual = posicaoCom(entries, idNoExtrato, ajuste.createdAt);
  const posicaoNova = posicaoCom(entries, idNoExtrato, novaIso);

  /** O dia anterior ao movimento mais antigo de todos, exceto este. */
  const diaAntesDeTudo = (() => {
    const outros = entries.filter((e) => e.id !== idNoExtrato);
    if (!outros.length) return null;
    const maisAntigo = outros.reduce((a, b) => (a.date < b.date ? a : b));
    const d = new Date(maisAntigo.date);
    d.setUTCDate(d.getUTCDate() - 1); // UTC, pela mesma razão do `paraIso`
    return d.toISOString().slice(0, 10);
  })();

  const mudouData = dia !== paraCampo(ajuste.createdAt);
  const mudouMotivo = motivo.trim() !== (ajuste.reason ?? '');
  const podeGravar = !!dia && (mudouData || mudouMotivo);

  const guardar = useMutation({
    mutationFn: () => balanceService.updateAdjustment(ajuste.id, {
      ...(mudouData ? { createdAt: novaIso } : {}),
      ...(mudouMotivo ? { reason: motivo.trim() } : {}),
    }),
    onSuccess: () => {
      toast.success('Movimento corrigido.');
      // Uma chave só: o extrato, o resumo e a lista de ajustes descendem todos
      // de `balance` — corrigir a data muda os três de uma vez.
      void qc.invalidateQueries({ queryKey: queryKeys.balance.all });
      onClose();
    },
    onError: (e) => toast.error(
      e instanceof ApiError ? e.message : 'Não foi possível guardar.',
    ),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Corrigir movimento</DialogTitle>
          <DialogDescription>
            A data decide a posição no extrato. O saldo total não muda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* O que é, sem poder mexer. */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                {ajuste.type === 'CREDIT' ? 'Crédito manual' : 'Débito manual'}
              </span>
              <span className={`font-semibold ${ajuste.type === 'CREDIT' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                {ajuste.type === 'CREDIT' ? '+' : '−'}{eur(ajuste.amount)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              O valor não se edita aqui. Para corrigir um valor errado, lance um
              ajuste contrário — assim fica o rasto das duas linhas.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aj-data">Data do movimento</Label>
            <Input
              id="aj-data"
              type="date"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
            />

            {diaAntesDeTudo && dia !== diaAntesDeTudo && (
              <Button
                type="button" variant="outline" size="sm"
                className="mt-1 h-7 gap-1.5 px-2 text-xs"
                onClick={() => setDia(diaAntesDeTudo)}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Pôr antes de todos os outros
              </Button>
            )}
          </div>

          {/* Onde vai cair. Sem isto, escolher uma data é às cegas. */}
          <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary p-3 text-xs">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-muted-foreground">
              {posicaoNova === posicaoAtual ? (
                <>Continua a ser o <strong className="text-foreground">{posicaoAtual}.º</strong> de {total} movimentos.</>
              ) : (
                <>
                  Passa do <strong className="text-foreground">{posicaoAtual}.º</strong> para
                  o <strong className="text-foreground">{posicaoNova}.º</strong> de {total} movimentos
                  {posicaoNova === 1 && ' — fica o primeiro de todos'}.
                </>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aj-motivo">Motivo</Label>
            <Input
              id="aj-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Saldo inicial em banca"
              maxLength={500}
            />
          </div>

          {ajuste.editedAt && (
            <p className="text-xs text-muted-foreground">
              Já foi editado em {new Date(ajuste.editedAt).toLocaleDateString('pt-PT')}
              {ajuste.editedByName ? ` por ${ajuste.editedByName}` : ''}.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!podeGravar || guardar.isPending} onClick={() => guardar.mutate()}>
            {guardar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
