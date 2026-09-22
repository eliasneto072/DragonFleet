// src/app/components/driver/investments.tsx
//
// Investimentos, do lado do motorista.
//
// O que a tela tem de deixar claro, por esta ordem:
//   1. quanto tem aplicado e quanto já rendeu;
//   2. que planos há e o que cada um promete — incluindo o custo de sair antes;
//   3. que aplicar TIRA o dinheiro do saldo principal, e que ele só volta no
//      resgate. É a regra que gera mais perguntas se não estiver escrita.

import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  AlertCircle, CalendarClock, ChevronRight, Info, Loader2, Lock, PiggyBank, Unlock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/context/AuthContext';
import { balanceService } from '@/features/admin/services/balance.service';
import {
  investmentsService, type InvestmentPlan,
} from '@/shared/services/investments.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { invalidateAfterInvestment } from '@/shared/lib/invalidate';
import { formatCurrency } from '@/shared/lib/format';
import {
  InvestmentDetailDialog, StatusPill, dia, planTypeLabel, taxa,
} from '@/app/components/investments/investment-detail';
import { useRankConfigs } from '@/app/components/ranks/rank-card';
import { RankBadge } from '@/app/components/ranks/rank-visuals';

// ── Aplicar ───────────────────────────────────────────────────────────────────

function ApplyDialog({ plan, available, onClose }: {
  plan: InvestmentPlan | null;
  available: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [valor, setValor] = useState('');
  const amount = Number(valor.replace(',', '.'));
  const valido = Number.isFinite(amount) && amount > 0;

  const m = useMutation({
    mutationFn: () => investmentsService.subscribe(plan!.id, Math.round(amount * 100) / 100),
    onSuccess: () => {
      invalidateAfterInvestment(qc);
      toast.success(`${formatCurrency(amount)} aplicados em "${plan?.name}".`);
      fechar();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível aplicar.'),
  });

  function fechar() {
    setValor('');
    onClose();
  }

  if (!plan) return null;

  const diario = valido ? (amount * plan.annualRate) / 100 / 365 : 0;
  const noFim = plan.type === 'FIXED' && plan.termDays && valido ? diario * plan.termDays : 0;
  const erro =
    !valido ? null
    : amount > available ? `Só tem ${formatCurrency(available)} disponíveis.`
    : amount < plan.minAmount ? `O mínimo deste plano é ${formatCurrency(plan.minAmount)}.`
    : null;

  return (
    <Dialog open={!!plan} onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aplicar em "{plan.name}"</DialogTitle>
          <DialogDescription>
            {planTypeLabel(plan)} · {taxa(plan.annualRate)} ao ano
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="inv-amount">Valor a aplicar (€)</Label>
            <Input
              id="inv-amount" type="number" inputMode="decimal" min="0.01" step="0.01"
              placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Disponível: {formatCurrency(available)}</span>
              {available > 0 && (
                <button
                  type="button" className="font-medium text-accent hover:underline"
                  onClick={() => setValor(String(available))}
                >
                  Aplicar tudo
                </button>
              )}
            </div>
            {erro && <p className="text-xs text-destructive">{erro}</p>}
          </div>

          {valido && !erro && (
            <dl className="rounded-lg bg-secondary p-3">
              <div className="flex justify-between gap-4 py-0.5">
                <dt className="text-muted-foreground">Rende por dia</dt>
                <dd className="tabular-nums">~ {formatCurrency(diario)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-0.5">
                <dt className="text-muted-foreground">Rende por mês (30 dias)</dt>
                <dd className="tabular-nums">~ {formatCurrency(diario * 30)}</dd>
              </div>
              {noFim > 0 && (
                <div className="flex justify-between gap-4 border-t border-border py-0.5 pt-1 font-medium">
                  <dt>No fim dos {plan.termDays} dias recebe</dt>
                  <dd className="tabular-nums">{formatCurrency(amount + noFim)}</dd>
                </div>
              )}
            </dl>
          )}

          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li className="flex gap-2">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              O valor sai do saldo principal agora e fica no investimento até ser resgatado.
            </li>
            {plan.type === 'FIXED' ? (
              <li className="flex gap-2">
                <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                A taxa fica fixa durante os {plan.termDays} dias. No fim, o valor e os ganhos voltam
                sozinhos ao saldo principal.
                {plan.earlyWithdrawalPenalty
                  ? ` Resgatar antes tem uma penalização de ${taxa(plan.earlyWithdrawalPenalty)} do valor aplicado.`
                  : ' Pode resgatar antes sem penalização.'}
              </li>
            ) : (
              <li className="flex gap-2">
                <Unlock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Pode resgatar a qualquer momento. A taxa pode ser alterada pelo escritório; os dias
                já pagos não mudam.
              </li>
            )}
            <li className="flex gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Os ganhos são calculados todos os dias sobre o valor aplicado.
            </li>
          </ul>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={fechar} disabled={m.isPending}>
            Cancelar
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={!valido || !!erro || m.isPending}
            onClick={() => m.mutate()}
          >
            {m.isPending
              ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />A aplicar…</>)
              : `Aplicar${valido ? ` ${formatCurrency(amount)}` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── A tela ────────────────────────────────────────────────────────────────────

export function Investments() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [aplicarEm, setAplicarEm] = useState<InvestmentPlan | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  const plansQ = useQuery({
    queryKey: queryKeys.investments.plans(false),
    queryFn: () => investmentsService.listPlans(false),
  });

  const mineQ = useQuery({
    queryKey: queryKeys.investments.mine,
    queryFn: () => investmentsService.mine(),
  });

  const balanceQ = useQuery({
    queryKey: queryKeys.balance.summary(user?.id ?? ''),
    queryFn: () => balanceService.getSummary(user!.id),
    enabled: !!user?.id,
  });

  // Os níveis, para mostrar quais os planos que ainda estão trancados e a
  // partir de que nível abrem. Trancado e visível motiva; escondido não.
  const rankConfigsQ = useRankConfigs();
  const nivelDoPlano = (tier: string | null) =>
    rankConfigsQ.data?.configs.find((c) => c.tier === tier);

  // Vindo do extrato ("Ver o investimento"): abrir logo essa aplicação.
  const pedida = (location.state as { openInvestment?: string } | null)?.openInvestment;
  useEffect(() => {
    if (!pedida) return;
    setAberta(pedida);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedida]);

  const available = Math.max(0, balanceQ.data?.balance.available ?? 0);
  const totals = mineQ.data?.totals;
  const lista = mineQ.data?.investments ?? [];
  const ativas = useMemo(() => lista.filter((i) => i.status === 'ACTIVE'), [lista]);
  const fechadas = useMemo(() => lista.filter((i) => i.status === 'CLOSED'), [lista]);
  const plans = plansQ.data?.plans ?? [];

  if (mineQ.isError || plansQ.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <p className="text-muted-foreground">Erro ao carregar os investimentos.</p>
        <Button variant="outline" onClick={() => { mineQ.refetch(); plansQ.refetch(); }}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Investimentos"
        subtitle="Ponha parte do saldo a render todos os dias"
        icon={<PiggyBank className="h-5 w-5" />}
      />

      {/* Resumo */}
      <div
        className="overflow-hidden rounded-xl p-5 shadow-brand sm:p-6"
        style={{ background: 'linear-gradient(135deg, #0d6b4f 0%, #0a5440 100%)' }}
      >
        {mineQ.isLoading ? (
          <Skeleton className="h-16 w-48 bg-white/20" />
        ) : (
          <>
            <p className="text-sm text-white/70">Valor atual dos investimentos</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-white tabular-nums sm:text-4xl">
              {formatCurrency(totals?.currentValue ?? 0)}
            </p>
            <dl className="mt-3 grid max-w-md grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-white/60">Aplicado</dt>
                <dd className="tabular-nums text-white">{formatCurrency(totals?.invested ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-white/60">Ganhos acumulados</dt>
                <dd className="tabular-nums text-white">+ {formatCurrency(totals?.gains ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-white/60">Rende por dia</dt>
                <dd className="tabular-nums text-white">~ {formatCurrency(totals?.dailyGain ?? 0)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-white/70">
              Saldo principal disponível para aplicar: {formatCurrency(available)}
            </p>
          </>
        )}
      </div>

      {/* Planos */}
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Planos disponíveis</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {plansQ.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-36 w-full" /><Skeleton className="h-36 w-full" />
            </div>
          ) : plans.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              De momento não há planos abertos.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {plans.map((p) => {
                const trancado = p.unlocked === false;
                const nivel = nivelDoPlano(p.minRank);
                return (
                <div
                  key={p.id}
                  className={`flex flex-col rounded-lg border border-border p-4 ${trancado ? 'opacity-70' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{planTypeLabel(p)}</p>
                    </div>
                    <p className="shrink-0 text-right">
                      <span className="block text-xl font-bold tabular-nums">{taxa(p.annualRate)}</span>
                      <span className="block text-[11px] text-muted-foreground">ao ano</span>
                    </p>
                  </div>
                  {p.description && <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>}
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {p.type === 'FIXED' ? (
                      <>
                        <li>Taxa fixa durante {p.termDays} dias</li>
                        <li>
                          {p.earlyWithdrawalPenalty
                            ? `Resgate antecipado: penalização de ${taxa(p.earlyWithdrawalPenalty)}`
                            : 'Resgate antecipado sem penalização'}
                        </li>
                      </>
                    ) : (
                      <>
                        <li>Resgate a qualquer momento</li>
                        <li>Taxa variável, definida pelo escritório</li>
                      </>
                    )}
                    {p.minAmount > 0 && <li>Mínimo {formatCurrency(p.minAmount)}</li>}
                  </ul>

                  {nivel && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      A partir de <RankBadge config={nivel} size="sm" />
                    </p>
                  )}

                  <Button
                    className="mt-3 w-full" size="sm"
                    disabled={available <= 0 || trancado}
                    onClick={() => setAplicarEm(p)}
                  >
                    {trancado ? `Precisa de ${nivel?.label ?? 'outro nível'}` : 'Aplicar'}
                  </Button>
                </div>
                );
              })}
            </div>
          )}
          {available <= 0 && plans.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Sem saldo disponível para aplicar. O saldo entra com os fechos semanais.
            </p>
          )}
        </CardContent>
      </Card>

      {/* As minhas aplicações */}
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">As minhas aplicações</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Toque para ver os ganhos dia a dia ou resgatar
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {mineQ.isLoading ? (
            <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : lista.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Ainda não fez nenhuma aplicação.
            </p>
          ) : (
            <ul>
              {[...ativas, ...fechadas].map((i) => (
                <li key={i.id} className="border-b border-border py-1 last:border-0">
                  <button
                    type="button" onClick={() => setAberta(i.id)}
                    className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{i.planName}</span>
                        <StatusPill inv={i} />
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatCurrency(i.principal)} desde {dia(i.startDate)}
                        {i.status === 'ACTIVE' && i.maturityDate && ` · termina a ${dia(i.maturityDate)}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">
                        {formatCurrency(i.status === 'ACTIVE' ? i.currentValue : (i.payout ?? 0))}
                      </span>
                      <span className="block text-xs tabular-nums text-brand-700 dark:text-emerald-300">
                        + {formatCurrency(i.gains)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {totals && totals.realizedGains !== 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Ganhos já recebidos em aplicações terminadas: {formatCurrency(totals.realizedGains)}
            </p>
          )}
        </CardContent>
      </Card>

      <ApplyDialog plan={aplicarEm} available={available} onClose={() => setAplicarEm(null)} />
      <InvestmentDetailDialog investmentId={aberta} onClose={() => setAberta(null)} canWithdraw />
    </div>
  );
}
