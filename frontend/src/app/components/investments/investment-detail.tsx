// src/app/components/investments/investment-detail.tsx
//
// O detalhe de uma aplicação: quanto está lá, quanto já rendeu, o registo
// (aplicação, um ganho por dia, resgate) e o botão de resgatar.
//
// Partilhado entre o motorista e a administração: os dois têm de ver
// exatamente o mesmo registo. Se o escritório visse uma versão e o motorista
// outra, a primeira pergunta ao suporte seria "qual das duas está certa".

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import { AlertTriangle, ArrowDownToLine, Loader2, Lock, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import {
  investmentsService, type Investment, type InvestmentEvent,
} from '@/shared/services/investments.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { invalidateAfterInvestment } from '@/shared/lib/invalidate';
import { formatCurrency } from '@/shared/lib/format';

/** 'AAAA-MM-DD' (ou ISO) → 'DD/MM/AAAA', sem passar por Date. */
export function dia(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 10).split('-').reverse().join('/');
}

/** "2,5%" — até três casas, sem zeros a mais. */
export function taxa(n: number): string {
  return `${n.toLocaleString('pt-PT', { maximumFractionDigits: 3 })}%`;
}

export function planTypeLabel(inv: { planType?: string; type?: string; termDays: number | null }): string {
  const t = inv.planType ?? inv.type;
  return t === 'FIXED' ? `Fixo · ${inv.termDays} dias` : 'Flexível';
}

export function StatusPill({ inv }: { inv: Investment }) {
  if (inv.status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-emerald-950 dark:text-emerald-300">
        <TrendingUp className="h-3 w-3" aria-hidden="true" /> A render
      </span>
    );
  }
  const label = inv.closeReason === 'MATURED' ? 'Terminado'
    : inv.closeReason === 'EARLY' ? 'Resgatado antes do prazo'
    : 'Resgatado';
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

function Row({ label, value, strong, negative }: {
  label: string; value: string; strong?: boolean; negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`shrink-0 tabular-nums ${strong ? 'font-semibold' : ''} ${negative ? 'text-destructive' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

// ── O registo ─────────────────────────────────────────────────────────────────

const GANHOS_VISIVEIS = 30;

function Registo({ events }: { events: InvestmentEvent[] }) {
  const [todos, setTodos] = useState(false);
  const ganhos = events.filter((e) => e.kind === 'GAIN');
  const outros = events.filter((e) => e.kind !== 'GAIN');
  const resgate = outros.find((e) => e.kind === 'REDEMPTION');
  const deposito = outros.find((e) => e.kind === 'DEPOSIT');
  const visiveis = todos ? ganhos : ganhos.slice(0, GANHOS_VISIVEIS);

  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Registo</p>
      <ul className="divide-y divide-border rounded-lg border border-border text-sm">
        {resgate && (
          <li className="flex items-center justify-between gap-3 px-3 py-2">
            <span>
              <span className="block font-medium">Voltou ao saldo principal</span>
              <span className="block text-xs text-muted-foreground">{dia(resgate.date)} · {resgate.detail}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">+ {formatCurrency(resgate.amount)}</span>
          </li>
        )}

        {visiveis.map((g) => (
          <li key={g.date} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className="text-muted-foreground">
              Ganho de {dia(g.date)}
              {g.annualRate != null && <span className="text-xs"> · {taxa(g.annualRate)} ao ano</span>}
            </span>
            {/* Quatro casas: um dia de 100 € a 2% são 0,0055 €, e mostrar
                "0,01 €" todos os dias faria a soma não bater com o total. */}
            <span className="shrink-0 tabular-nums text-brand-700 dark:text-emerald-300">
              + {g.amount.toLocaleString('pt-PT', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} €
            </span>
          </li>
        ))}

        {ganhos.length > GANHOS_VISIVEIS && (
          <li className="px-3 py-1.5">
            <button
              type="button" className="text-xs font-medium text-accent hover:underline"
              onClick={() => setTodos((v) => !v)}
            >
              {todos ? 'Mostrar menos' : `Ver os ${ganhos.length} dias`}
            </button>
          </li>
        )}

        {ganhos.length === 0 && !resgate && (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            O primeiro ganho aparece amanhã: cada dia é pago depois de terminar.
          </li>
        )}

        {deposito && (
          <li className="flex items-center justify-between gap-3 px-3 py-2">
            <span>
              <span className="block font-medium">Aplicado</span>
              <span className="block text-xs text-muted-foreground">{dia(deposito.date)} · saiu do saldo principal</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(deposito.amount)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

// ── O diálogo ─────────────────────────────────────────────────────────────────

export function InvestmentDetailDialog({
  investmentId, onClose, canWithdraw,
}: {
  investmentId: string | null;
  onClose: () => void;
  /** O titular e o ADMIN podem resgatar; o resto só vê. */
  canWithdraw: boolean;
}) {
  const qc = useQueryClient();
  const [confirmar, setConfirmar] = useState(false);

  const detailQ = useQuery({
    queryKey: queryKeys.investments.detail(investmentId ?? ''),
    queryFn: () => investmentsService.detail(investmentId!),
    enabled: !!investmentId,
  });

  const previewQ = useQuery({
    queryKey: ['investments', 'preview', investmentId],
    queryFn: () => investmentsService.previewWithdraw(investmentId!),
    enabled: !!investmentId && confirmar,
    // Sempre fresco: o valor muda à meia-noite, e mostrar um preço antigo no
    // ecrã de confirmação é pior do que esperar meio segundo.
    staleTime: 0,
  });

  const withdrawM = useMutation({
    mutationFn: () => investmentsService.withdraw(investmentId!),
    onSuccess: (r) => {
      invalidateAfterInvestment(qc);
      toast.success(`${formatCurrency(r.investment.payout ?? 0)} voltaram ao saldo principal.`);
      setConfirmar(false);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível resgatar.'),
  });

  function fechar() {
    setConfirmar(false);
    onClose();
  }

  const inv = detailQ.data?.investment;
  const p = previewQ.data?.preview;

  return (
    <Dialog open={!!investmentId} onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{inv?.planName ?? 'Investimento'}</DialogTitle>
          <DialogDescription>
            {inv ? `${planTypeLabel(inv)}${inv.userName ? ` · ${inv.userName}` : ''}` : 'A carregar…'}
          </DialogDescription>
        </DialogHeader>

        {detailQ.isLoading || !inv ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : confirmar ? (
          // ── Confirmar o resgate ──
          <div className="space-y-4 text-sm">
            {previewQ.isLoading || !p ? (
              <Skeleton className="h-28 w-full" />
            ) : (
              <>
                {p.reason === 'EARLY' && (
                  <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>
                      Este plano só termina a {dia(inv.maturityDate)}. Resgatar antes tem uma
                      penalização de {taxa(inv.penaltyRate ?? 0)} sobre o valor aplicado.
                    </p>
                  </div>
                )}
                <dl className="rounded-lg border border-border p-3">
                  <Row label="Valor aplicado" value={formatCurrency(p.principal)} />
                  <Row label="Ganhos até ontem" value={`+ ${formatCurrency(p.gains)}`} />
                  {p.penalty > 0 && (
                    <Row label="Penalização" value={`− ${formatCurrency(p.penalty)}`} negative />
                  )}
                  <div className="border-t border-border">
                    <Row label="Volta ao saldo principal" value={formatCurrency(p.payout)} strong />
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">
                  O dia de hoje ainda não rendeu: cada dia só é pago depois de terminar.
                </p>
              </>
            )}
          </div>
        ) : (
          // ── O detalhe ──
          <div className="space-y-4 text-sm">
            <div className="rounded-lg bg-secondary p-3">
              <p className="text-xs text-muted-foreground">
                {inv.status === 'ACTIVE' ? 'Valor atual' : 'Voltou ao saldo principal'}
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {formatCurrency(inv.status === 'ACTIVE' ? inv.currentValue : (inv.payout ?? 0))}
              </p>
              {inv.status === 'ACTIVE' && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Rende cerca de {formatCurrency(inv.dailyGain)} por dia · {taxa(inv.currentRate)} ao ano
                </p>
              )}
            </div>

            <dl>
              <Row label="Aplicado" value={formatCurrency(inv.principal)} />
              <Row label="Ganhos" value={`+ ${formatCurrency(inv.gains)}`} />
              {inv.penaltyAmount != null && inv.penaltyAmount > 0 && (
                <Row label="Penalização" value={`− ${formatCurrency(inv.penaltyAmount)}`} negative />
              )}
              <Row label="Início" value={dia(inv.startDate)} />
              {inv.maturityDate && <Row label="Fim do prazo" value={dia(inv.maturityDate)} />}
              {inv.planType === 'FIXED' && inv.status === 'ACTIVE' && (
                <Row
                  label="Resgate antecipado"
                  value={inv.penaltyRate ? `penalização de ${taxa(inv.penaltyRate)}` : 'sem penalização'}
                />
              )}
              {inv.planType === 'FLEXIBLE' && inv.status === 'ACTIVE' && (
                <Row label="Resgate" value="a qualquer momento" />
              )}
            </dl>

            {inv.status === 'ACTIVE' && inv.planType === 'FIXED' && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                No fim do prazo o valor e os ganhos voltam sozinhos ao saldo principal.
              </p>
            )}

            <Registo events={detailQ.data?.events ?? []} />
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          {confirmar ? (
            <>
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setConfirmar(false)}
                disabled={withdrawM.isPending}>
                Voltar
              </Button>
              <Button className="w-full sm:w-auto" onClick={() => withdrawM.mutate()}
                disabled={withdrawM.isPending || !p}>
                {withdrawM.isPending
                  ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />A resgatar…</>)
                  : `Confirmar resgate${p ? ` de ${formatCurrency(p.payout)}` : ''}`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="w-full sm:w-auto" onClick={fechar}>Fechar</Button>
              {canWithdraw && inv?.status === 'ACTIVE' && (
                <Button className="w-full sm:w-auto" onClick={() => setConfirmar(true)}>
                  <ArrowDownToLine className="mr-2 h-4 w-4" aria-hidden="true" />
                  Resgatar
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

