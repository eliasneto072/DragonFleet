// src/app/components/admin/admin-dashboard.tsx
//
// Painel do administrador: o que precisa de ação agora.
//
// DIVISÃO DE PAPÉIS: este painel responde "o que faço agora"; a tela de
// Análises responde "como estamos a ir". Nenhum gráfico vive aqui — sob esse
// critério, uma série temporal é sempre pergunta de Análises.
//
// O QUE SAIU: o gráfico de receita mensal e a pizza de plataformas, que
// duplicavam o que Análises passou a mostrar corretamente (a pizza contava
// lançamentos em vez de somar euros, e o eixo do gráfico formatava em R$).
// Saíram também os três cartões do rodapé, que repetiam números do topo.
//
// A IDADE É O DADO: "5 documentos pendentes" não distingue cinco chegados
// hoje de manhã de um parado há seis dias. Um documento parado é um motorista
// que não está a faturar.
//
// FONTE: uma chamada a GET /analytics/overview, agregada em SQL. A versão
// anterior descarregava /users, /earnings, /withdrawals e /documents inteiros
// para totalizar no browser.

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import { AlertCircle, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { analyticsService, type ApiOverview } from '@/features/admin/services/analytics.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import { WorkQueue } from '@/app/components/admin/queue/WorkQueue';
import { buildQueue, sortQueue } from '@/app/components/admin/queue/registry';
import type { QueueItem } from '@/app/components/admin/queue/types';

/** Dias inteiros decorridos desde uma data ISO. */
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ── Linha da fila ─────────────────────────────────────────────────────────────

function Metric({
  label, value, hint, tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const toneCls =
    tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-destructive' : 'text-muted-foreground';
  return (
    <Card className="shadow-card">
      <CardContent className="p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
        {hint && <p className={`mt-1 flex items-center gap-1 text-xs ${toneCls}`}>{hint}</p>}
      </CardContent>
    </Card>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" role="status" aria-busy="true">
      <span className="sr-only">A carregar o painel…</span>

      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>

      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6"><Skeleton className="h-5 w-44" /></CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-52" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-8 w-20 shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="shadow-card">
            <CardContent className="space-y-2 p-4 sm:p-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────


export function AdminDashboard() {
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.analytics.overview,
    queryFn: () => analyticsService.getOverview(),
  });

  const overview: ApiOverview | undefined = data?.overview;

  const queue = useMemo<QueueItem[]>(() => {
    if (!overview) return [];
    return sortQueue(buildQueue(overview));
  }, [overview]);

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !overview) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <p className="text-muted-foreground">Erro ao carregar o painel.</p>
        <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  const { finance, drivers } = overview;

  const revenueTrend = finance.revenuePrevMonth > 0
    ? ((finance.revenueThisMonth - finance.revenuePrevMonth) / finance.revenuePrevMonth) * 100
    : null;

  return (
    <div className="space-y-5 sm:space-y-6">

      <div>
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Painel</h2>
        <p className="text-sm text-muted-foreground">
          {drivers.total} motorista{drivers.total !== 1 ? 's' : ''} registado
          {drivers.total !== 1 ? 's' : ''} · {drivers.activeLast30} faturou
          {drivers.activeLast30 !== 1 ? 'ram' : ''} nos últimos 30 dias
        </p>
      </div>

      {/* Fila de trabalho — três níveis, ver queue/types.ts */}
      <WorkQueue items={queue} expiringDays={overview.queue.documentsExpiringSoon.days} />

      {/* Posição financeira */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <Metric
          label="Receita deste mês"
          value={formatCurrency(finance.revenueThisMonth)}
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
                {Math.round(finance.companyCommission * 100)}% de {formatCurrency(finance.grossThisMonth)}
              </span>
            )
          }
        />
        <Metric
          label="Devido aos motoristas"
          value={formatCurrency(finance.owedToDrivers)}
          hint={
            finance.owedByDrivers > 0
              ? `Inclui ${formatCurrency(finance.owedByDrivers)} a receber de motoristas`
              : 'Podem sacar a qualquer momento'
          }
        />
        <Metric
          label="Pago este mês"
          value={formatCurrency(finance.paidThisMonth)}
          hint={`${finance.paidCountThisMonth} retirada${finance.paidCountThisMonth !== 1 ? 's' : ''} liquidada${finance.paidCountThisMonth !== 1 ? 's' : ''}`}
        />
      </div>

      {/* Motoristas parados */}
      {drivers.stalled.length > 0 && (
        <Card className="shadow-card">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Motoristas que pararam</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Faturavam e deixaram de lançar há mais de {drivers.stalledAfterDays} dias
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <ul>
              {drivers.stalled.map((d) => {
                const days = daysSince(d.lastEarningAt);
                return (
                  <li key={d.id} className="border-b border-border py-2 last:border-0">
                    <button
                      type="button"
                      onClick={() => navigate('/app/admin/drivers')}
                      className="flex w-full items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/40"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-muted-foreground"
                        aria-hidden="true"
                      >
                        {initials(d.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{d.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          Último lançamento há {days} dias · {formatCurrency(d.totalEarned)} no total
                        </span>
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}