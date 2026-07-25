// src/app/components/driver/driver-dashboard.tsx
//
// Painel do motorista.
//
// REGRA DE NEGÓCIO — ajustes de saldo entram nos ganhos:
// Um crédito lançado pela administração é, na prática, uma corrida que entrou
// por fora do registo. Por isso os cartões "Ganhos líquidos", "Esta semana" e
// "Semana anterior" somam créditos e subtraem débitos. A palavra "ajuste" não
// aparece na interface do motorista.
// O cartão chama-se "Ganhos líquidos", e não "Ganhos totais", porque com
// débitos incluídos o número pode descer de uma semana para a outra — um
// número chamado "ganhos" que diminui confunde.
//
// LIMITAÇÃO CONHECIDA — datação dos ajustes:
// Earning tem `date` (o dia da corrida) e `createdAt` (quando foi lançada).
// BalanceAdjustment só tem `createdAt`. Os ajustes são portanto datados pela
// criação: um crédito lançado hoje referente a uma corrida de duas semanas
// atrás conta na semana corrente. Resolver isto exige um campo de data de
// referência no modelo, decidido para depois.
//
// GRÁFICOS — adaptam-se ao volume de dados:
// Um gráfico de seis meses com um único mês preenchido desenha cinco zeros, e
// uma linha ligando zeros afirma que o motorista ganhou nada nesses meses,
// quando na verdade não estava na plataforma. Por isso: barras em vez de linha
// (barra não interpola), e quando o período seleccionado tem menos de dois
// intervalos com movimento, mostra-se um estado explicativo em vez do gráfico.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
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
  ArrowDownToLine, History, ChevronDown, BarChart3, Lightbulb,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import { earningsService } from '@/features/driver/services/earnings.service';
import { withdrawalsService } from '@/features/driver/services/withdrawals.service';
import { balanceService } from '@/features/admin/services/balance.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { useAuth } from '@/features/auth/context/AuthContext';
import { formatCurrency, formatCurrencyCompact, formatPercent } from '@/shared/lib/format';
import {
  PLATFORM_OPTIONS, platformColor, platformLabel, ADJUSTMENT_COLOR,
} from '@/shared/lib/platform-labels';
import { WalletIllustration } from '@/app/components/ui/wallet-illustration';
import { EarningsHistoryModal } from './earnings-history-modal';
import type { Adjustment } from '@/features/admin/services/balance.service';
import type { ApiEarning, ApiWithdrawal, EarningPlatform } from '@/shared/types/api';

type Period = '14d' | '30d' | '12m';

const PERIOD_LABELS: Record<Period, string> = {
  '14d': 'Últimos 14 dias',
  '30d': 'Últimos 30 dias',
  '12m': 'Últimos 12 meses',
};

// ── Helpers de data ───────────────────────────────────────────────────────────

// Earnings vêm como @db.Date. `new Date("2026-06-21")` parseia como meia-noite
// UTC, mas os limites de semana são locais — a diferença pode empurrar um ganho
// para o dia ou a semana errados. Parsear Y/M/D para data local resolve.
function parseLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const datePart = String(value).slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  if (y && m && d) return new Date(y, m - 1, d);
  return new Date(value);
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function startOfWeek(): Date {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Movimentos ────────────────────────────────────────────────────────────────

/** Ganho registado ou ajuste, reduzidos a data + valor com sinal. */
interface Movement {
  date: Date;
  amount: number;
  platform: EarningPlatform | null; // null = ajuste de saldo
}

function toMovements(earnings: ApiEarning[], adjustments: Adjustment[]): Movement[] {
  return [
    ...earnings.map((e) => ({
      date: parseLocalDate(e.date),
      amount: Number(e.amount),
      platform: e.platform,
    })),
    ...adjustments.map((a) => ({
      date: startOfDay(new Date(a.createdAt)),
      amount: a.type === 'CREDIT' ? Number(a.amount) : -Number(a.amount),
      platform: null,
    })),
  ];
}

function sumBetween(movements: Movement[], from: Date, to: Date): number {
  return movements
    .filter((m) => m.date >= from && m.date < to)
    .reduce((s, m) => s + m.amount, 0);
}

// ── Séries dos gráficos ───────────────────────────────────────────────────────

interface Bucket { label: string; total: number }

function buildSeries(movements: Movement[], period: Period): Bucket[] {
  const now = new Date();

  if (period === '12m') {
    const map: Record<string, number> = {};
    movements.forEach((m) => {
      const k = monthKey(m.date);
      map[k] = (map[k] ?? 0) + m.amount;
    });
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return {
        label: d.toLocaleDateString('pt-PT', { month: 'short' }),
        total: Math.round((map[monthKey(d)] ?? 0) * 100) / 100,
      };
    });
  }

  const days = period === '14d' ? 14 : 30;
  const map: Record<string, number> = {};
  movements.forEach((m) => {
    const k = dayKey(m.date);
    map[k] = (map[k] ?? 0) + m.amount;
  });

  return Array.from({ length: days }, (_, i) => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - (days - 1 - i));
    return {
      label: d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }),
      total: Math.round((map[dayKey(d)] ?? 0) * 100) / 100,
    };
  });
}

/** Origem dos ganhos nos últimos `days`, por plataforma + ajustes líquidos. */
function buildOrigin(movements: Movement[], days = 30) {
  const cutoff = startOfDay(new Date());
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const inRange = movements.filter((m) => m.date >= cutoff);

  const byPlatform: Record<string, { amount: number; count: number }> = {};
  let adjustmentsNet = 0;

  inRange.forEach((m) => {
    if (m.platform === null) {
      adjustmentsNet += m.amount;
      return;
    }
    byPlatform[m.platform] = byPlatform[m.platform] ?? { amount: 0, count: 0 };
    byPlatform[m.platform].amount += m.amount;
    byPlatform[m.platform].count += 1;
  });

  const segments = Object.entries(byPlatform)
    .map(([key, v]) => ({
      key,
      label: platformLabel(key),
      color: platformColor(key),
      amount: v.amount,
      count: v.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Créditos líquidos entram como um segmento próprio para que a soma da barra
  // bata com o cartão "Ganhos líquidos". Descontos líquidos não viram segmento
  // (não há barra negativa); aparecem como nota abaixo da legenda.
  if (adjustmentsNet > 0) {
    segments.push({
      key: 'ADJUSTMENT',
      label: 'Adicionado pela gestão',
      color: ADJUSTMENT_COLOR,
      amount: adjustmentsNet,
      count: 0,
    });
  }

  const total = segments.reduce((s, x) => s + x.amount, 0);
  return {
    segments: segments.map((s) => ({
      ...s,
      share: total > 0 ? (s.amount / total) * 100 : 0,
    })),
    total,
    deductions: adjustmentsNet < 0 ? Math.abs(adjustmentsNet) : 0,
  };
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">A carregar o painel…</span>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-9 w-36 shrink-0" />
      </div>

      <Skeleton className="h-48 w-full rounded-xl" />

      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="shadow-card">
            <CardContent className="space-y-2 pt-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-card">
        <CardHeader><Skeleton className="h-5 w-52" /></CardHeader>
        <CardContent><Skeleton className="h-[260px] w-full" /></CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader><Skeleton className="h-5 w-52" /></CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-3.5 w-full rounded-full" />
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Estado de dados insuficientes ─────────────────────────────────────────────

function NotEnoughData({ onRegister }: { onRegister: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <BarChart3 className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium">Ainda não dá para desenhar a evolução</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Registe ganhos em pelo menos dois dias diferentes e o gráfico aparece aqui.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRegister}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />Registar ganho
      </Button>
    </div>
  );
}

// ── Modal de registo de ganho ─────────────────────────────────────────────────

function AddEarningModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
                {PLATFORM_OPTIONS.map((p) => (
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
  const navigate = useNavigate();

  const [addOpen, setAddOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [period, setPeriod] = useState<Period>('14d');

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

  // GET /balance/:userId/adjustments é libertado ao próprio dono
  // (ensureOwnerOrManager no balance.service do backend), não só a admins.
  const adjustmentsQuery = useQuery({
    queryKey: queryKeys.balance.adjustments(user?.id ?? ''),
    queryFn: () => balanceService.listAdjustments(user!.id),
    enabled: !!user?.id,
  });

  const earnings = earningsQuery.data?.earnings ?? [];
  const withdrawals: ApiWithdrawal[] = withdrawalsQuery.data?.withdrawals ?? [];
  const adjustments = adjustmentsQuery.data?.adjustments ?? [];
  const summary = balanceQuery.data?.balance;

  const movements = useMemo(
    () => toMovements(earnings, adjustments),
    [earnings, adjustments],
  );

  const series = useMemo(() => buildSeries(movements, period), [movements, period]);
  const origin = useMemo(() => buildOrigin(movements), [movements]);

  const isLoading = earningsQuery.isLoading || withdrawalsQuery.isLoading;
  const isError = earningsQuery.isError || withdrawalsQuery.isError;

  if (isLoading) return <DashboardSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Erro ao carregar dados do dashboard.</p>
      </div>
    );
  }

  // ── Saldo ───────────────────────────────────────────────────────────────────
  const localBalance = Math.max(
    movements.reduce((s, m) => s + m.amount, 0)
      - withdrawals
        .filter((w) => w.status === 'PAID' || w.status === 'APPROVED')
        .reduce((s, w) => s + Number(w.amount), 0),
    0,
  );
  const balance = summary?.available ?? localBalance;

  const breakdownRows: { label: string; value: number; sign: '+' | '−' }[] = summary
    ? [
        { label: 'Ganhos registados', value: summary.totalEarnings, sign: '+' },
        ...(summary.totalCredits > 0
          ? [{ label: 'Adicionado pela gestão', value: summary.totalCredits, sign: '+' as const }]
          : []),
        ...(summary.totalDebits > 0
          ? [{ label: 'Descontos', value: summary.totalDebits, sign: '−' as const }]
          : []),
        ...(summary.totalWithdrawn > 0
          ? [{ label: 'Já retirado', value: summary.totalWithdrawn, sign: '−' as const }]
          : []),
        ...(summary.pendingWithdrawals > 0
          ? [{ label: 'Retiradas em análise', value: summary.pendingWithdrawals, sign: '−' as const }]
          : []),
      ]
    : [];

  // ── KPIs (líquidos de ajustes) ──────────────────────────────────────────────
  const netTotal = movements.reduce((s, m) => s + m.amount, 0);

  const thisWeekStart = startOfWeek();
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const thisWeek = sumBetween(movements, thisWeekStart, thisWeekEnd);
  const lastWeek = sumBetween(movements, lastWeekStart, thisWeekStart);
  const weekTrend = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : null;

  // ── Frases de conclusão ─────────────────────────────────────────────────────
  const activeBuckets = series.filter((b) => b.total > 0);
  const hasSeries = activeBuckets.length >= 2;

  const best = activeBuckets.reduce<Bucket | null>(
    (acc, b) => (!acc || b.total > acc.total ? b : acc), null,
  );
  const average = activeBuckets.length
    ? activeBuckets.reduce((s, b) => s + b.total, 0) / activeBuckets.length
    : 0;
  const unit = period === '12m' ? 'mês' : 'dia';
  const unitPlural = period === '12m' ? 'meses' : 'dias';

  const topSegment = origin.segments[0];

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
        <Button onClick={() => setAddOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Registar Ganho
        </Button>
      </div>

      {/* Hero */}
      <div
        className="overflow-hidden rounded-xl p-6 shadow-brand"
        style={{ background: 'linear-gradient(135deg, #0d6b4f 0%, #0a5440 100%)' }}
      >
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/70">Saldo disponível para retirada</p>

            <p className="mt-1 text-4xl font-bold tracking-tight text-white tabular-nums">
              {formatCurrency(balance)}
            </p>

            {breakdownRows.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setBreakdownOpen((v) => !v)}
                  aria-expanded={breakdownOpen}
                  className="flex items-center gap-1 rounded text-xs text-white/70 transition-colors hover:text-white"
                >
                  Como chegámos a este valor
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${breakdownOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>

                {breakdownOpen && (
                  <dl className="mt-2 max-w-xs space-y-1 border-t border-white/15 pt-2 text-xs">
                    {breakdownRows.map((row) => (
                      <div key={row.label} className="flex justify-between gap-4">
                        <dt className="text-white/70">{row.label}</dt>
                        <dd className="tabular-nums text-white/90">
                          {row.sign} {formatCurrency(row.value)}
                        </dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-4 border-t border-white/15 pt-1 font-medium">
                      <dt className="text-white">Disponível</dt>
                      <dd className="tabular-nums text-white">{formatCurrency(balance)}</dd>
                    </div>
                  </dl>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/25"
                onClick={() => navigate('/app/driver/withdrawals', { state: { openNew: true } })}
              >
                <ArrowDownToLine className="h-4 w-4" /> Retirar
              </button>
              <button
                className="flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/25"
                onClick={() => setHistoryOpen(true)}
              >
                <History className="h-4 w-4" /> Histórico
              </button>
            </div>
          </div>

          <WalletIllustration
            tone="brand"
            surface="dark"
            className="hidden h-40 w-auto shrink-0 sm:block lg:h-44"
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-1">Ganhos líquidos</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(netTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {earnings.length} lançamento{earnings.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-1">Esta semana</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(thisWeek)}</p>
            {weekTrend !== null ? (
              <p className={`text-xs mt-1 flex items-center gap-1 ${weekTrend >= 0 ? 'text-success' : 'text-destructive'}`}>
                {weekTrend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {formatPercent(weekTrend)} vs. semana anterior
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">Desde domingo</p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-1">Semana anterior</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(lastWeek)}</p>
            <p className="text-xs text-muted-foreground mt-1">7 dias antes</p>
          </CardContent>
        </Card>
      </div>

      {/* Quanto ganhou por dia */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Quanto ganhou por {unit}</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">{PERIOD_LABELS[period]}</p>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[168px] shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {!hasSeries ? (
            <NotEnoughData onRegister={() => setAddOpen(true)} />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={series} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label" stroke="var(--muted-foreground)" fontSize={11}
                    tickLine={false} axisLine={false} interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="var(--muted-foreground)" fontSize={11}
                    tickLine={false} axisLine={false}
                    tickFormatter={(v) => (v === 0 ? '€0' : formatCurrencyCompact(v))}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--secondary)' }}
                    formatter={(v: number) => [formatCurrency(v), 'Ganhos']}
                  />
                  <Bar dataKey="total" fill="#108865" radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>

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

      {/* De onde vem o seu dinheiro */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>De onde vem o seu dinheiro</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Últimos 30 dias · {formatCurrency(origin.total)} no total
          </p>
        </CardHeader>
        <CardContent>
          {origin.segments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum ganho nos últimos 30 dias.
            </p>
          ) : (
            <>
              <div className="mb-4 flex h-3.5 gap-0.5 overflow-hidden">
                {origin.segments.map((s, i) => (
                  <div
                    key={s.key}
                    style={{
                      width: `${s.share}%`,
                      background: s.color,
                      borderTopLeftRadius: i === 0 ? 7 : 0,
                      borderBottomLeftRadius: i === 0 ? 7 : 0,
                      borderTopRightRadius: i === origin.segments.length - 1 ? 7 : 0,
                      borderBottomRightRadius: i === origin.segments.length - 1 ? 7 : 0,
                    }}
                  />
                ))}
              </div>

              <ul className="space-y-2">
                {origin.segments.map((s) => (
                  <li key={s.key} className="flex items-center gap-2.5 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: s.color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    {s.count > 0 && (
                      <span className="hidden shrink-0 text-muted-foreground sm:inline">
                        {s.count} lançamento{s.count !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="w-20 shrink-0 text-right tabular-nums">
                      {formatCurrency(s.amount)}
                    </span>
                    <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                      {Math.round(s.share)}%
                    </span>
                  </li>
                ))}
              </ul>

              {origin.deductions > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Descontos aplicados no período: −{formatCurrency(origin.deductions)}
                </p>
              )}

              {topSegment && (
                <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <strong className="font-medium text-foreground">{topSegment.label}</strong> responde
                    por {Math.round(topSegment.share)}% do que entrou nos últimos 30 dias.
                  </span>
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AddEarningModal open={addOpen} onClose={() => setAddOpen(false)} />
      <EarningsHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        earnings={earnings}
        adjustments={adjustments}
      />
    </div>
  );
}
