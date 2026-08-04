// src/app/components/admin/financial-control.tsx
//
// Controlo financeiro: o dinheiro que sai para os motoristas.
//
// O QUE MUDOU E PORQUÊ: os indicadores somavam a tabela de ganhos e
// multiplicavam pela constante do frontend. Nenhuma das duas coisas é verdade
// desde o fecho semanal — os lançamentos deixaram de creditar e a comissão vive
// nas configurações. "Ganhos totais" mostrava o que os motoristas comunicaram,
// e "Receita" ficava um terço acima do real.
//
// Agora tudo vem de /analytics/overview, agregado em SQL, que é a mesma fonte
// do painel. Duas telas a mostrar números diferentes para a mesma pergunta é
// pior do que não os mostrar.
//
// O gráfico saiu. Ele comparava ganhos, pagos, receita e pendentes na mesma
// escala — quatro grandezas que não se somam nem se comparam entre si.

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  AlertCircle, CheckCircle, Clock, DollarSign, Loader2, TrendingDown,
  TrendingUp, Wallet, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { withdrawalsService } from '@/features/driver/services/withdrawals.service';
import { usersService } from '@/features/admin/services/users.service';
import { analyticsService } from '@/features/admin/services/analytics.service';
import { formatCurrency } from '@/shared/lib/format';
import { queryKeys } from '@/shared/lib/query-keys';
import type { ApiWithdrawal, WithdrawalStatus } from '@/shared/types/api';

// Variantes dark: obrigatórias — bg-*-100 com text-*-800 não invertem sozinhas
// e no modo escuro dariam texto escuro sobre fundo claro.
const STATUS_META: Record<
  WithdrawalStatus,
  { label: string; icon: typeof CheckCircle; cls: string }
> = {
  PAID: {
    label: 'Pago',
    icon: CheckCircle,
    cls: 'bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  APPROVED: {
    label: 'Aprovado',
    icon: CheckCircle,
    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  },
  PENDING: {
    label: 'Em análise',
    icon: Clock,
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  REJECTED: {
    label: 'Rejeitado',
    icon: XCircle,
    cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  },
};

function StatusBadge({ status }: { status: WithdrawalStatus }) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
      <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function agoLabel(days: number): string {
  if (days === 0) return 'hoje';
  if (days === 1) return 'há 1 dia';
  return `há ${days} dias`;
}

/** Acima disto, o pedido passa a ser destacado como atrasado. */
const OVERDUE_DAYS = 3;

// ── Métrica ───────────────────────────────────────────────────────────────────

function Metric({
  label, value, hint, icon: Icon, tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  icon: typeof Wallet;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const toneCls =
    tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-destructive' : 'text-muted-foreground';
  return (
    <Card className="shadow-card">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
        {hint && <p className={`mt-1 flex items-center gap-1 text-xs ${toneCls}`}>{hint}</p>}
      </CardContent>
    </Card>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function FinancialSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" role="status" aria-busy="true">
      <span className="sr-only">A carregar dados financeiros…</span>

      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-60" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="shadow-card">
            <CardContent className="space-y-2 p-4 sm:p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6"><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-8 w-40 shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export function FinancialControl() {
  const queryClient = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<ApiWithdrawal | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | WithdrawalStatus>('all');

  const withdrawalsQ = useQuery({
    queryKey: queryKeys.withdrawals.list,
    queryFn: () => withdrawalsService.list(),
  });

  const usersQ = useQuery({
    queryKey: queryKeys.users.list,
    queryFn: () => usersService.list(),
  });

  // Mesma fonte do painel: agregado em SQL, com a comissão vinda das
  // configurações. Somar aqui daria dois números para a mesma pergunta.
  const overviewQ = useQuery({
    queryKey: queryKeys.analytics.overview,
    queryFn: () => analyticsService.getOverview(),
  });

  const withdrawals = withdrawalsQ.data?.withdrawals ?? [];
  const users = usersQ.data?.users ?? [];
  const finance = overviewQ.data?.overview.finance;

  const driverName = (userId: string) =>
    users.find((u) => u.id === userId)?.name ?? '—';

  const pending = useMemo(
    () => withdrawals
      .filter((w) => w.status === 'PENDING')
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
    [withdrawals],
  );

  const history = useMemo(
    () => withdrawals
      .filter((w) => w.status !== 'PENDING')
      .filter((w) => historyFilter === 'all' || w.status === historyFilter)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [withdrawals, historyFilter],
  );

  const pendingTotal = pending.reduce((s, w) => s + Number(w.amount), 0);

  const { mutate: updateStatus, isPending: updating } = useMutation({
    mutationFn: ({ id, status, notes }: {
      id: string; status: WithdrawalStatus; notes?: string;
    }) => withdrawalsService.updateStatus(id, { status, notes }),
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.withdrawals.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.balance.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      toast.success(vars.status === 'REJECTED' ? 'Retirada rejeitada.' : 'Retirada aprovada.');
      setRejectTarget(null);
      setRejectNotes('');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível atualizar a retirada.'),
  });

  if (withdrawalsQ.isLoading || overviewQ.isLoading) return <FinancialSkeleton />;

  if (withdrawalsQ.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <p className="text-muted-foreground">Erro ao carregar dados financeiros.</p>
        <Button variant="outline" onClick={() => withdrawalsQ.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const revenueTrend = finance && finance.revenuePrevMonth > 0
    ? ((finance.revenueThisMonth - finance.revenuePrevMonth) / finance.revenuePrevMonth) * 100
    : null;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Financeiro"
        subtitle="Retiradas dos motoristas e posição da empresa"
        icon={<DollarSign className="h-5 w-5" />}
      />

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Metric
          label="Receita deste mês"
          value={formatCurrency(finance?.revenueThisMonth ?? 0)}
          icon={TrendingUp}
          tone={revenueTrend !== null && revenueTrend < 0 ? 'danger' : 'success'}
          hint={
            revenueTrend !== null ? (
              <>
                {revenueTrend >= 0
                  ? <TrendingUp className="h-3 w-3 shrink-0" aria-hidden="true" />
                  : <TrendingDown className="h-3 w-3 shrink-0" aria-hidden="true" />}
                {Math.abs(Math.round(revenueTrend))}% vs. mês anterior
              </>
            ) : (
              <span className="text-muted-foreground">
                {Math.round((finance?.companyCommission ?? 0) * 100)}% dos ganhos da frota
              </span>
            )
          }
        />
        <Metric
          label="Devido aos motoristas"
          value={formatCurrency(finance?.owedToDrivers ?? 0)}
          icon={Wallet}
          hint={
            finance && finance.owedByDrivers > 0
              ? `${formatCurrency(finance.owedByDrivers)} a receber de motoristas`
              : 'Podem sacar a qualquer momento'
          }
        />
        <Metric
          label="Pago este mês"
          value={formatCurrency(finance?.paidThisMonth ?? 0)}
          icon={CheckCircle}
          hint={`${finance?.paidCountThisMonth ?? 0} retirada${finance?.paidCountThisMonth !== 1 ? 's' : ''} liquidada${finance?.paidCountThisMonth !== 1 ? 's' : ''}`}
        />
        <Metric
          label="Por processar"
          value={formatCurrency(pendingTotal)}
          icon={Clock}
          hint={`${pending.length} pedido${pending.length !== 1 ? 's' : ''}`}
        />
      </div>

      {/* Pendentes */}
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Retiradas por processar</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Quem espera há mais tempo aparece primeiro
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {pending.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle className="h-8 w-8 text-success" aria-hidden="true" />
              <p className="text-sm font-medium">Nada por processar</p>
              <p className="text-sm text-muted-foreground">
                Todas as retiradas foram decididas.
              </p>
            </div>
          ) : (
            <ul>
              {pending.map((w) => {
                const days = daysSince(w.requestedAt);
                const overdue = days >= OVERDUE_DAYS;
                return (
                  <li key={w.id} className="border-b border-border py-3 last:border-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{driverName(w.userId)}</p>
                        <p
                          className={`truncate text-xs ${
                            overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
                          }`}
                        >
                          Pedida {agoLabel(days)}
                        </p>
                      </div>

                      <p className="shrink-0 text-base font-semibold tabular-nums">
                        {formatCurrency(Number(w.amount))}
                      </p>

                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm" className="h-8" disabled={updating}
                          onClick={() => updateStatus({ id: w.id, status: 'APPROVED' })}
                        >
                          <CheckCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          Aprovar
                        </Button>
                        <Button
                          size="sm" variant="outline" className="h-8" disabled={updating}
                          onClick={() => { setRejectTarget(w); setRejectNotes(''); }}
                        >
                          <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          Rejeitar
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-col gap-3 space-y-0 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div>
            <CardTitle className="text-base sm:text-lg">Histórico de retiradas</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {history.length} registo{history.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Select
            value={historyFilter}
            onValueChange={(v) => setHistoryFilter(v as 'all' | WithdrawalStatus)}
          >
            <SelectTrigger className="w-full sm:w-[170px]" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="PAID">Pago</SelectItem>
              <SelectItem value="APPROVED">Aprovado</SelectItem>
              <SelectItem value="REJECTED">Rejeitado</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {history.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma retirada neste filtro.
            </p>
          ) : (
            <ul>
              {history.map((w) => {
                const note = w.notes?.trim();
                return (
                  <li key={w.id} className="border-b border-border py-3 last:border-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{driverName(w.userId)}</p>
                          <StatusBadge status={w.status} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(w.requestedAt).toLocaleDateString('pt-PT')}
                          {w.processedAt && (
                            <> · decidida em {new Date(w.processedAt).toLocaleDateString('pt-PT')}</>
                          )}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatCurrency(Number(w.amount))}
                      </p>
                    </div>

                    {note && (
                      <p
                        className={`mt-2 rounded-md p-2 text-xs ${
                          w.status === 'REJECTED'
                            ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {w.status === 'REJECTED' && <span className="font-medium">Motivo: </span>}
                        {note}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Rejeição — o backend devolve NOTES_REQUIRED sem motivo */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectNotes(''); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar retirada</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  {formatCurrency(Number(rejectTarget.amount))} de {driverName(rejectTarget.userId)},
                  pedida em {new Date(rejectTarget.requestedAt).toLocaleDateString('pt-PT')}.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reject-notes">Motivo</Label>
            <Textarea
              id="reject-notes"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Explique ao motorista por que a retirada foi recusada."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              O motorista vê este texto no histórico dele e recebe por email.
            </p>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline" disabled={updating} className="w-full sm:w-auto"
              onClick={() => { setRejectTarget(null); setRejectNotes(''); }}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={updating || !rejectNotes.trim()}
              className="w-full sm:w-auto"
              onClick={() => updateStatus({
                id: rejectTarget!.id, status: 'REJECTED', notes: rejectNotes.trim(),
              })}
            >
              {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
