// src/app/components/admin/analytics-dashboard.tsx
//
// Tela de análises: como a operação evolui ao longo do tempo.
//
// DIVISÃO DE PAPÉIS: o painel responde "o que faço agora"; esta tela responde
// "como estamos a ir". O critério para decidir onde um gráfico vive: se a
// resposta muda alguma coisa hoje, é painel; se só faz sentido olhando semanas
// para trás, é aqui.
//
// FONTE DOS DADOS: uma única chamada a GET /analytics/stats, agregada em SQL.
// Antes esta tela pedia /users, /earnings, /withdrawals e /documents — as
// tabelas inteiras — e somava em JavaScript. Com uma centena de motoristas
// seriam dezenas de milhares de linhas pela rede para mostrar meia dúzia de
// números, além de expor os dados individuais de toda a gente.
//
// GRANULARIDADE: quem decide se as barras são diárias ou mensais é o backend,
// porque é ele que faz o GROUP BY. O frontend só formata o rótulo.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Button } from '@/app/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { AlertCircle, BarChart3, Lightbulb } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { analyticsService, type ApiStats } from '@/features/admin/services/analytics.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency, formatCurrencyCompact, formatPercent } from '@/shared/lib/format';
import { platformColor, platformLabel } from '@/shared/lib/platform-labels';
import { FINANCIAL } from '@/shared/constants';

type PeriodKey = '30d' | '90d' | '12m';

const PERIOD_LABELS: Record<PeriodKey, string> = {
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  '12m': 'Últimos 12 meses',
};

const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  boxShadow: 'var(--shadow-md)',
};

function toInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function periodRange(period: PeriodKey): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (period === '30d') from.setDate(from.getDate() - 29);
  else if (period === '90d') from.setDate(from.getDate() - 89);
  else from.setMonth(from.getMonth() - 11, 1);
  return { from: toInputValue(from), to: toInputValue(to) };
}

/** "2026-07-14" → "14/07"  ·  "2026-07" → "jul." */
function formatBucket(bucket: string, granularity: 'day' | 'month'): string {
  if (granularity === 'month') {
    const [y, m] = bucket.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('pt-PT', { month: 'short' });
  }
  const [, m, d] = bucket.split('-');
  return `${d}/${m}`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function AnalyticsSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" role="status" aria-busy="true">
      <span className="sr-only">A carregar as análises…</span>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-full sm:w-44" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
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
        <CardHeader className="p-4 sm:p-6"><Skeleton className="h-5 w-52" /></CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <Skeleton className="h-[240px] w-full" />
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6"><Skeleton className="h-5 w-52" /></CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          <Skeleton className="h-3.5 w-full rounded-full" />
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Métrica ───────────────────────────────────────────────────────────────────

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function AnalyticsDashboard() {
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const range = useMemo(() => periodRange(period), [period]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.analytics.stats(range.from, range.to),
    queryFn: () => analyticsService.getStats(range),
  });

  const stats: ApiStats | undefined = data?.stats;

  if (isLoading) return <AnalyticsSkeleton />;

  if (isError || !stats) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <p className="text-muted-foreground">Erro ao carregar as análises.</p>
        <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  const granularity = stats.range.granularity;
  const revenue = stats.grossEarnings * FINANCIAL.companyCommission;

  const series = stats.series.map((s) => ({
    label: formatBucket(s.bucket, granularity),
    total: Math.round(s.total * 100) / 100,
  }));
  const active = series.filter((s) => s.total > 0);
  const hasSeries = active.length >= 2;

  const best = active.reduce<{ label: string; total: number } | null>(
    (acc, b) => (!acc || b.total > acc.total ? b : acc), null,
  );
  const average = active.length
    ? active.reduce((s, b) => s + b.total, 0) / active.length
    : 0;
  const unit = granularity === 'month' ? 'mês' : 'dia';
  const unitPlural = granularity === 'month' ? 'meses' : 'dias';

  const platformTotal = stats.earningsByPlatform.reduce((s, p) => s + p.total, 0);
  const segments = stats.earningsByPlatform.map((p) => ({
    key: p.platform,
    label: platformLabel(p.platform),
    color: platformColor(p.platform),
    total: p.total,
    count: p.count,
    share: platformTotal > 0 ? (p.total / platformTotal) * 100 : 0,
  }));
  const topSegment = segments[0];

  const retention = stats.totalDrivers > 0
    ? (stats.activeInPeriod / stats.totalDrivers) * 100
    : 0;

  const avgPerEntry = stats.earningsCount > 0
    ? stats.grossEarnings / stats.earningsCount
    : 0;

  return (
    <div className="space-y-5 sm:space-y-6">

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground sm:text-2xl">Análises</h2>
          <p className="text-sm text-muted-foreground">{PERIOD_LABELS[period]}</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <SelectTrigger className="w-full sm:w-[180px]" aria-label="Período das análises">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((p) => (
              <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Métricas do período */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Metric
          label="Receita da plataforma"
          value={formatCurrency(revenue)}
          hint={`${Math.round(FINANCIAL.companyCommission * 100)}% dos ganhos brutos`}
        />
        <Metric
          label="Ganhos dos motoristas"
          value={formatCurrency(stats.grossEarnings)}
          hint={`${stats.earningsCount} lançamento${stats.earningsCount !== 1 ? 's' : ''}`}
        />
        <Metric
          label="Motoristas que faturaram"
          value={`${stats.activeInPeriod} de ${stats.totalDrivers}`}
          hint={`${formatPercent(retention)} do cadastro`}
        />
        <Metric
          label="Média por lançamento"
          value={formatCurrency(avgPerEntry)}
          hint="Ganhos brutos ÷ lançamentos"
        />
      </div>

      {/* Evolução */}
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Quanto a frota faturou por {unit}</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Ganhos brutos dos motoristas, antes da comissão
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {!hasSeries ? (
            <div className="flex flex-col items-center gap-3 px-2 py-12 text-center">
              <BarChart3 className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
              <p className="max-w-sm text-sm text-muted-foreground">
                Ainda não há movimento suficiente neste período para desenhar a evolução.
              </p>
            </div>
          ) : (
            <>
              <div className="h-[220px] w-full sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="label" stroke="var(--muted-foreground)" fontSize={10}
                      tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12}
                    />
                    <YAxis
                      stroke="var(--muted-foreground)" fontSize={10} width={56}
                      tickLine={false} axisLine={false}
                      tickFormatter={(v) => (v === 0 ? '€0' : formatCurrencyCompact(v))}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--secondary)' }}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={{ color: 'var(--muted-foreground)' }}
                      itemStyle={{ color: 'var(--popover-foreground)' }}
                      formatter={(v: number) => [formatCurrency(v), 'Ganhos brutos']}
                    />
                    <Bar dataKey="total" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {best && (
                <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Melhor {unit}: <strong className="font-medium text-foreground">{formatCurrency(best.total)}</strong> em {best.label}.
                    Média de {formatCurrency(average)} nos {unitPlural} com movimento.
                  </span>
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Origem da receita */}
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">De onde vem a receita</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatCurrency(platformTotal)} em ganhos brutos no período
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {segments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum lançamento no período.
            </p>
          ) : (
            <>
              <div className="mb-4 flex h-3.5 gap-0.5 overflow-hidden">
                {segments.map((s, i) => (
                  <div
                    key={s.key}
                    style={{
                      width: `${s.share}%`,
                      background: s.color,
                      borderTopLeftRadius: i === 0 ? 7 : 0,
                      borderBottomLeftRadius: i === 0 ? 7 : 0,
                      borderTopRightRadius: i === segments.length - 1 ? 7 : 0,
                      borderBottomRightRadius: i === segments.length - 1 ? 7 : 0,
                    }}
                  />
                ))}
              </div>

              <ul className="space-y-2">
                {segments.map((s) => (
                  <li key={s.key} className="flex items-center gap-2 text-sm sm:gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: s.color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    <span className="hidden shrink-0 text-muted-foreground md:inline">
                      {s.count} lançamento{s.count !== 1 ? 's' : ''}
                    </span>
                    <span className="shrink-0 tabular-nums">{formatCurrency(s.total)}</span>
                    <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
                      {Math.round(s.share)}%
                    </span>
                  </li>
                ))}
              </ul>

              {topSegment && (
                <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <strong className="font-medium text-foreground">{topSegment.label}</strong> responde
                    por {Math.round(topSegment.share)}% dos ganhos da frota no período.
                  </span>
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Top motoristas */}
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Quem mais faturou</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Ganhos brutos por motorista no período
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {stats.topDrivers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum motorista com lançamentos no período.
            </p>
          ) : (
            <ul>
              {stats.topDrivers.map((d, i) => {
                const share = stats.grossEarnings > 0
                  ? (d.total / stats.grossEarnings) * 100
                  : 0;
                return (
                  <li
                    key={d.email}
                    className="flex items-center gap-3 border-b border-border py-2.5 last:border-0"
                  >
                    <span className="w-5 shrink-0 text-sm tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{d.email}</p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums">{formatCurrency(d.total)}</span>
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {Math.round(share)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
