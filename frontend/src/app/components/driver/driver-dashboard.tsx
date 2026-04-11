// src/app/components/driver/driver-dashboard.tsx

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { StatsCard } from '@/app/components/stats-card';
import { DollarSign, TrendingUp, TrendingDown, Wallet, Loader2, AlertCircle } from 'lucide-react';
import {
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import { earningsService } from '@/features/driver/services/earnings.service';
import { withdrawalsService } from '@/features/driver/services/withdrawals.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { useAuth } from '@/features/auth/context/AuthContext';
import type { ApiEarning, ApiWithdrawal } from '@/shared/types/api';

// ── Helpers de cálculo ────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  UBER:     'Uber',
  BOLT:     'Bolt',
  FREE_NOW: 'Free Now',
  OTHER:    'Outro',
};

function startOfWeek(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // domingo como início
  return d;
}

function startOfLastWeek(): Date {
  const d = startOfWeek();
  d.setDate(d.getDate() - 7);
  return d;
}

/** Agrupa ganhos por mês e retorna os últimos N meses */
function buildMonthlyData(earnings: ApiEarning[], months = 6) {
  const map: Record<string, number> = {};

  earnings.forEach((e) => {
    const d     = new Date(e.date);
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map[key]    = (map[key] ?? 0) + Number(e.amount);
  });

  // Preenche os últimos N meses mesmo que sem ganhos
  const result: { month: string; earnings: number }[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    result.push({
      month:    d.toLocaleDateString('pt-BR', { month: 'short' }),
      earnings: Math.round(map[key] ?? 0),
    });
  }

  return result;
}

/** Agrupa ganhos por dia da semana (últimos 30 dias) */
function buildWeeklyData(earnings: ApiEarning[]) {
  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const map  = Object.fromEntries(DAYS.map((d) => [d, 0]));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  earnings
    .filter((e) => new Date(e.date) >= cutoff)
    .forEach((e) => {
      const day  = DAYS[new Date(e.date).getDay()];
      map[day]  += 1;
    });

  return DAYS.map((day) => ({ day, corridas: map[day] }));
}

/** Calcula saldo disponível: ganhos totais − saques pagos/aprovados */
function calcBalance(earnings: ApiEarning[], withdrawals: ApiWithdrawal[]) {
  const totalEarned = earnings.reduce((s, e) => s + Number(e.amount), 0);
  const totalWithdrawn = withdrawals
    .filter((w) => w.status === 'PAID' || w.status === 'APPROVED')
    .reduce((s, w) => s + Number(w.amount), 0);
  return Math.max(totalEarned - totalWithdrawn, 0);
}

// ── Componente ────────────────────────────────────────────────────────────────

export function DriverDashboard() {
  const { user } = useAuth();

  const earningsQuery = useQuery({
    queryKey: queryKeys.earnings.list,
    queryFn:  () => earningsService.list(),
  });

  const withdrawalsQuery = useQuery({
    queryKey: queryKeys.withdrawals.list,
    queryFn:  () => withdrawalsService.list(),
  });

  const isLoading = earningsQuery.isLoading || withdrawalsQuery.isLoading;
  const isError   = earningsQuery.isError   || withdrawalsQuery.isError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando dashboard…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-muted-foreground">Erro ao carregar dados do dashboard.</p>
      </div>
    );
  }

  const earnings    = earningsQuery.data?.earnings    ?? [];
  const withdrawals = withdrawalsQuery.data?.withdrawals ?? [];

  // ── Cálculos ────────────────────────────────────────────────────────────────
  const totalEarnings = earnings.reduce((s, e) => s + Number(e.amount), 0);
  const balance       = calcBalance(earnings, withdrawals);

  const thisWeekStart = startOfWeek();
  const lastWeekStart = startOfLastWeek();

  const thisWeekEarnings = earnings
    .filter((e) => new Date(e.date) >= thisWeekStart)
    .reduce((s, e) => s + Number(e.amount), 0);

  const lastWeekEarnings = earnings
    .filter((e) => {
      const d = new Date(e.date);
      return d >= lastWeekStart && d < thisWeekStart;
    })
    .reduce((s, e) => s + Number(e.amount), 0);

  const weekTrend =
    lastWeekEarnings > 0
      ? ((thisWeekEarnings - lastWeekEarnings) / lastWeekEarnings) * 100
      : null;

  const monthlyData = buildMonthlyData(earnings);
  const weeklyData  = buildWeeklyData(earnings);
  const recentFive  = [...earnings]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">

      {/* Saudação */}
      <div>
        <h2 className="text-2xl font-bold">Olá, {user?.name?.split(' ')[0]} 👋</h2>
        <p className="text-muted-foreground">Aqui está o resumo da sua atividade.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          title="Saldo Disponível"
          value={`R$ ${balance.toFixed(2)}`}
          description="Disponível para saque"
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatsCard
          title="Ganhos Totais"
          value={`R$ ${totalEarnings.toFixed(2)}`}
          description={`${earnings.length} lançamento${earnings.length !== 1 ? 's' : ''} no histórico`}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <StatsCard
          title="Esta Semana"
          value={`R$ ${thisWeekEarnings.toFixed(2)}`}
          description="Ganhos dos últimos 7 dias"
          icon={<TrendingUp className="h-4 w-4" />}
          trend={
            weekTrend !== null
              ? {
                  value:    `${weekTrend >= 0 ? '+' : ''}${weekTrend.toFixed(1)}% vs. semana anterior`,
                  positive: weekTrend >= 0,
                }
              : undefined
          }
        />
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ganhos Mensais</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.every((d) => d.earnings === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                Nenhum ganho registrado ainda.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number) =>
                      [`R$ ${v.toFixed(2)}`, 'Ganhos']
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="earnings"
                    stroke="#108865"
                    strokeWidth={2}
                    dot={{ fill: '#108865' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Corridas por Dia da Semana</CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyData.every((d) => d.corridas === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                Nenhuma corrida nos últimos 30 dias.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [v, 'Corridas']} />
                  <Bar dataKey="corridas" fill="#108865" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ganhos recentes */}
      <Card>
        <CardHeader>
          <CardTitle>Ganhos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentFive.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum ganho registrado ainda.
            </p>
          ) : (
            <div className="space-y-4">
              {recentFive.map((earning) => (
                <div
                  key={earning.id}
                  className="flex items-center justify-between border-b pb-3 last:border-0"
                >
                  <div className="flex-1">
                    <p className="font-medium">
                      {PLATFORM_LABELS[earning.platform] ?? earning.platform}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(earning.date).toLocaleDateString('pt-BR', {
                        day:   '2-digit',
                        month: 'short',
                        year:  'numeric',
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">
                      + R$ {Number(earning.amount).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}