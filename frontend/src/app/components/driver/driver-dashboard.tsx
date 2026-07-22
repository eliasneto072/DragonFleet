// src/app/components/driver/driver-dashboard.tsx
//
// Redesigned (Design System v2 / "Variation A"):
// - Deep-green balance hero card with quick actions
// - Neutral KPI cards with depth
// - Per-platform earnings breakdown (rows w/ share %)
// - Currency unified to formatCurrency() — fixes the old €/R$ mix
// - Same data layer, services and modal logic as before
//
// Saldo: usa GET /balance/:userId (mesma fonte do admin, inclui ajustes).

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  TrendingUp, TrendingDown, Loader2, AlertCircle, Plus,
  ArrowDownToLine, History, Wallet,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { toast } from 'sonner';
import { earningsService } from '@/features/driver/services/earnings.service';
import { withdrawalsService } from '@/features/driver/services/withdrawals.service';
import { balanceService } from '@/features/admin/services/balance.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { useAuth } from '@/features/auth/context/AuthContext';
import { formatCurrency, formatCurrencyCompact, formatPercent, formatDate } from '@/shared/lib/format';
import type { ApiEarning, ApiWithdrawal, EarningPlatform } from '@/shared/types/api';

// ── Constantes ────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  UBER: 'Uber', BOLT: 'Bolt', FREE_NOW: 'Free Now', OTHER: 'Outro',
};

const PLATFORM_BADGE: Record<string, { letter: string; bg: string; fg: string }> = {
  UBER: { letter: 'U', bg: '#1D1D1D', fg: '#ffffff' },
  BOLT: { letter: 'B', bg: '#108865', fg: '#ffffff' },
  FREE_NOW: { letter: 'F', bg: '#5dbf9c', fg: '#073d2f' },
  OTHER: { letter: 'O', bg: '#8fd4ba', fg: '#073d2f' },
};

const PLATFORMS: { value: EarningPlatform; label: string }[] = [
  { value: 'UBER', label: 'Uber' },
  { value: 'BOLT', label: 'Bolt' },
  { value: 'FREE_NOW', label: 'Free Now' },
  { value: 'OTHER', label: 'Outro' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Earnings dates are stored as @db.Date (date-only). `new Date("2026-06-21")`
// parses as UTC midnight, but our week boundaries are in LOCAL time — that
// mismatch could push a day's earnings into the wrong week near midnight.
// Parsing the Y/M/D into a LOCAL date keeps comparisons consistent.
function parseLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const datePart = String(value).slice(0, 10); // "YYYY-MM-DD"
  const [y, m, d] = datePart.split('-').map(Number);
  if (y && m && d) return new Date(y, m - 1, d); // local midnight
  return new Date(value);
}

function startOfWeek(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function startOfLastWeek(): Date {
  const d = startOfWeek();
  d.setDate(d.getDate() - 7);
  return d;
}

function buildMonthlyData(earnings: ApiEarning[], months = 6) {
  const map: Record<string, number> = {};
  earnings.forEach((e) => {
    const d = new Date(e.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map[key] = (map[key] ?? 0) + Number(e.amount);
  });

  const result: { month: string; earnings: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    result.push({
      month: d.toLocaleDateString('pt-PT', { month: 'short' }),
      earnings: Math.round(map[key] ?? 0),
    });
  }
  return result;
}

function buildWeeklyData(earnings: ApiEarning[]) {
  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const map = Object.fromEntries(DAYS.map((d) => [d, 0]));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  earnings
    .filter((e) => new Date(e.date) >= cutoff)
    .forEach((e) => {
      const day = DAYS[new Date(e.date).getDay()];
      map[day] += 1;
    });

  return DAYS.map((day) => ({ day, corridas: map[day] }));
}

/** Earnings grouped by platform over the last `days`, with share %. */
function buildPlatformBreakdown(earnings: ApiEarning[], days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const totals: Record<string, { amount: number; count: number }> = {};
  let grand = 0;

  earnings
    .filter((e) => new Date(e.date) >= cutoff)
    .forEach((e) => {
      const p = e.platform;
      totals[p] = totals[p] ?? { amount: 0, count: 0 };
      totals[p].amount += Number(e.amount);
      totals[p].count += 1;
      grand += Number(e.amount);
    });

  return Object.entries(totals)
    .map(([platform, v]) => ({
      platform,
      amount: v.amount,
      count: v.count,
      share: grand > 0 ? (v.amount / grand) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

// Fallback local enquanto o endpoint de saldo carrega.
function calcBalance(earnings: ApiEarning[], withdrawals: ApiWithdrawal[]) {
  const totalEarned = earnings.reduce((s, e) => s + Number(e.amount), 0);
  const totalWithdrawn = withdrawals
    .filter((w) => w.status === 'PAID' || w.status === 'APPROVED')
    .reduce((s, w) => s + Number(w.amount), 0);
  return Math.max(totalEarned - totalWithdrawn, 0);
}

// ── Modal de registo de ganho ─────────────────────────────────────────────────

interface AddEarningModalProps {
  open: boolean;
  onClose: () => void;
}

function AddEarningModal({ open, onClose }: AddEarningModalProps) {
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [platform, setPlatform] = useState<EarningPlatform>('UBER');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const mutation = useMutation({
    mutationFn: () =>
      earningsService.create({ amount: parseFloat(amount), platform, date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.earnings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.balance.all });
      toast.success('Ganho registado com sucesso!');
      handleClose();
    },
    onError: () => toast.error('Erro ao registar ganho. Tenta novamente.'),
  });

  function handleClose() {
    setAmount('');
    setPlatform('UBER');
    setDate(new Date().toISOString().slice(0, 10));
    onClose();
  }

  function handleSubmit() {
    const value = parseFloat(amount);
    if (!amount || isNaN(value) || value <= 0) {
      toast.error('Insere um valor válido.');
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registar Ganho</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Valor (€)</Label>
            <Input
              id="amount" type="number" min="0.01" step="0.01" placeholder="0,00"
              value={amount} onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Plataforma</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as EarningPlatform)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date">Data</Label>
            <Input
              id="date" type="date" value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending
              ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" />A guardar…</>)
              : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function DriverDashboard() {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  const earningsQuery = useQuery({
    queryKey: queryKeys.earnings.list,
    queryFn: () => earningsService.list(),
  });

  const withdrawalsQuery = useQuery({
    queryKey: queryKeys.withdrawals.list,
    queryFn: () => withdrawalsService.list(),
  });

  const balanceQuery = useQuery({
    queryKey: queryKeys.balance.summary(user?.id ?? ''),
    queryFn: () => balanceService.getSummary(user!.id),
    enabled: !!user?.id,
  });

  const isLoading = earningsQuery.isLoading || withdrawalsQuery.isLoading;
  const isError = earningsQuery.isError || withdrawalsQuery.isError;

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
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Erro ao carregar dados do dashboard.</p>
      </div>
    );
  }

  const earnings = earningsQuery.data?.earnings ?? [];
  const withdrawals = withdrawalsQuery.data?.withdrawals ?? [];

  // Cálculos
  const totalEarnings = earnings.reduce((s, e) => s + Number(e.amount), 0);
  // Fonte única de verdade: mesmo endpoint que o admin usa (inclui ajustes).
  // Fallback para o cálculo local enquanto a query de saldo carrega.
  const balance = balanceQuery.data?.balance.available ?? calcBalance(earnings, withdrawals);
  const thisWeekStart = startOfWeek();
  const lastWeekStart = startOfLastWeek();
  // End of this week (start + 7 days) so "this week" can't leak future dates.
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);

  const thisWeekEarnings = earnings
    .filter((e) => { const d = parseLocalDate(e.date); return d >= thisWeekStart && d < thisWeekEnd; })
    .reduce((s, e) => s + Number(e.amount), 0);

  const lastWeekEarnings = earnings
    .filter((e) => { const d = parseLocalDate(e.date); return d >= lastWeekStart && d < thisWeekStart; })
    .reduce((s, e) => s + Number(e.amount), 0);

  // Trend of THIS week relative to LAST week. Positive = this week is higher.
  const weekTrend =
    lastWeekEarnings > 0
      ? ((thisWeekEarnings - lastWeekEarnings) / lastWeekEarnings) * 100
      : null;

  const monthlyData = buildMonthlyData(earnings);
  const weeklyData = buildWeeklyData(earnings);
  const platformBreakdown = buildPlatformBreakdown(earnings);
  const recentFive = [...earnings]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            Olá, {user?.name?.split(' ')[0]} 👋
          </h2>
          <p className="text-muted-foreground">Aqui está o resumo da sua atividade.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Registar Ganho
        </Button>
      </div>

      {/* Hero: saldo + ações (Variation A) */}
      <div
        className="rounded-xl p-6 shadow-brand"
        style={{ background: 'linear-gradient(135deg, #0d6b4f 0%, #0a5440 100%)' }}
      >
        <div className="flex items-center gap-2 text-[#9FE1CB] text-sm mb-1.5">
          <Wallet className="h-4 w-4" />
          <span>Saldo disponível para retirada</span>
        </div>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div className="flex items-baseline gap-3">
            <span className="text-white text-4xl font-bold tracking-tight">
              {formatCurrency(balance)}
            </span>
            {weekTrend !== null && (
              <span className={`text-sm flex items-center gap-1 ${weekTrend >= 0 ? 'text-[#5DCAA5]' : 'text-red-300'}`}>
                {weekTrend >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {formatPercent(weekTrend)}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition-colors text-white text-sm font-medium rounded-lg px-4 py-2"
              onClick={() => { window.location.href = '/app/driver/withdrawals'; }}
            >
              <ArrowDownToLine className="h-4 w-4" /> Retirar
            </button>
            <button
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition-colors text-white text-sm font-medium rounded-lg px-4 py-2"
              onClick={() => { window.location.href = '/app/driver/withdrawals'; }}
            >
              <History className="h-4 w-4" /> Histórico
            </button>
          </div>
        </div>
      </div>

      {/* KPIs neutros */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-1">Ganhos totais</p>
            <p className="text-2xl font-bold">{formatCurrency(totalEarnings)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {earnings.length} lançamento{earnings.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-1">Esta semana</p>
            <p className="text-2xl font-bold">{formatCurrency(thisWeekEarnings)}</p>
            {weekTrend !== null ? (
              <p className={`text-xs mt-1 flex items-center gap-1 ${weekTrend >= 0 ? 'text-success' : 'text-destructive'}`}>
                {weekTrend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {formatPercent(weekTrend)} vs. semana anterior
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">Últimos 7 dias</p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-1">Semana anterior</p>
            <p className="text-2xl font-bold">{formatCurrency(lastWeekEarnings)}</p>
            <p className="text-xs text-muted-foreground mt-1">7 dias antes</p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown por plataforma */}
      {platformBreakdown.length > 0 && (
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Ganhos por plataforma</CardTitle>
            <span className="text-xs text-muted-foreground">Últimos 30 dias</span>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {platformBreakdown.map((row) => {
                const badge = PLATFORM_BADGE[row.platform] ?? PLATFORM_BADGE.OTHER;
                return (
                  <div key={row.platform} className="flex items-center gap-3">
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0"
                      style={{ background: badge.bg, color: badge.fg }}
                    >
                      {badge.letter}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">
                          {PLATFORM_LABELS[row.platform] ?? row.platform}
                          <span className="text-muted-foreground font-normal ml-2">
                            {row.count} corrida{row.count !== 1 ? 's' : ''}
                          </span>
                        </span>
                        <span className="text-muted-foreground">{formatCurrency(row.amount)}</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${row.share}%`, background: badge.bg }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                      {Math.round(row.share)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gráficos */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle>Ganhos mensais</CardTitle></CardHeader>
          <CardContent>
            {monthlyData.every((d) => d.earnings === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                Nenhum ganho registado ainda.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis
                    stroke="var(--muted-foreground)" fontSize={12}
                    tickFormatter={(v) => (v === 0 ? '€0' : formatCurrencyCompact(v))}
                  />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), 'Ganhos']} />
                  <Line type="monotone" dataKey="earnings" stroke="#108865" strokeWidth={2.5} dot={{ fill: '#108865', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle>Corridas por dia da semana</CardTitle></CardHeader>
          <CardContent>
            {weeklyData.every((d) => d.corridas === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                Nenhuma corrida nos últimos 30 dias.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip formatter={(v: number) => [v, 'Corridas']} />
                  <Bar dataKey="corridas" fill="#108865" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ganhos recentes */}
      <Card className="shadow-card">
        <CardHeader><CardTitle>Ganhos recentes</CardTitle></CardHeader>
        <CardContent>
          {recentFive.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum ganho registado ainda. Clica em "Registar Ganho" para começar.
            </p>
          ) : (
            <div className="space-y-3">
              {recentFive.map((earning) => {
                const badge = PLATFORM_BADGE[earning.platform] ?? PLATFORM_BADGE.OTHER;
                return (
                  <div
                    key={earning.id}
                    className="flex items-center gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0"
                      style={{ background: badge.bg, color: badge.fg }}
                    >
                      {badge.letter}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">
                        {PLATFORM_LABELS[earning.platform] ?? earning.platform}
                      </p>
                      <p className="text-sm text-muted-foreground">{formatDate(earning.date)}</p>
                    </div>
                    <p className="font-semibold text-success">
                      + {formatCurrency(earning.amount)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AddEarningModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}