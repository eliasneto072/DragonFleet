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
// criação. O backend aplica o mesmo critério ao gerar o PDF.
//
// GRÁFICOS — adaptam-se ao volume de dados:
// Barras em vez de linha, porque linha interpola e afirmaria ganhos zero em
// meses em que o motorista simplesmente não estava na plataforma. Quando o
// período tem menos de dois intervalos com movimento, mostra-se um estado
// explicativo em vez do gráfico.
//
// RESPONSIVIDADE:
// O shell dá px-4 no telemóvel, logo o cartão útil tem ~328px num ecrã de 360.
// O hero divide essa largura entre texto e ilustração; o detalhe do saldo e os
// botões ficam FORA dessa linha, ocupando a largura toda, senão quebrariam em
// duas linhas cada.
//
// MODO ESCURO:
// O gradiente do hero é fixo e não acompanha o tema — em dark a escala de
// marca clareia, e um hero mais claro no escuro fica errado. Todo o texto lá
// dentro usa branco com opacidade, nunca text-brand-*. Já as barras e o
// tooltip do gráfico usam variáveis de tema: Recharts renderiza SVG no DOM
// (não canvas), por isso var(--…) resolve normalmente.

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

// Recharts renderiza SVG no DOM, então variáveis de tema resolvem aqui.
// --chart-1 é #108865 em claro e #2aa37c em escuro; um hex fixo ficaria
// apagado contra o fundo escuro.
const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  boxShadow: 'var(--shadow-md)',
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-9 w-full sm:w-36 sm:shrink-0" />
      </div>

      <Skeleton className="h-52 w-full rounded-xl sm:h-48" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i} className={`shadow-card ${i === 0 ? 'col-span-2 sm:col-span-1' : ''}`}>
            <CardContent className="space-y-2 p-4 pt-5 sm:p-6">
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

// ── Estado de dados insuficientes ─────────────────────────────────────────────

function NotEnoughData({ onRegister }: { onRegister: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-10 text-center sm:py-12">
      <BarChart3 className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium">Ainda não dá para desenhar a evolução</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
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

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="outline" onClick={handleClose} disabled={mutation.isPending}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} className="w-full sm:w-auto">
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
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
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
    <div className="space-y-5 sm:space-y-6">

      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold text-foreground sm:text-2xl">
            Olá, {user?.name?.split(' ')[0]} 👋
          </h2>
          <p className="text-sm text-muted-foreground sm:text-base">
            Aqui está o resumo da sua atividade.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="w-full sm:w-auto sm:shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Registar Ganho
        </Button>
      </div>

      {/* Hero */}
      <div
        className="overflow-hidden rounded-xl p-5 shadow-brand sm:p-6"
        style={{ background: 'linear-gradient(135deg, #0d6b4f 0%, #0a5440 100%)' }}
      >
        {/* Só o valor divide a linha com a ilustração. O detalhe e os botões
            ficam abaixo, com a largura toda, senão quebrariam no telemóvel. */}
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/70">Saldo disponível para retirada</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-white tabular-nums sm:text-4xl">
              {formatCurrency(balance)}
            </p>
          </div>

          <WalletIllustration
            tone="brand"
            surface="dark"
            className="h-20 w-auto shrink-0 sm:h-32 lg:h-40"
          />
        </div>

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
              <dl className="mt-2 max-w-sm space-y-1 border-t border-white/15 pt-2 text-xs">
                {breakdownRows.map((row) => (
                  <div key={row.label} className="flex justify-between gap-4">
                    <dt className="text-white/70">{row.label}</dt>
                    <dd className="shrink-0 tabular-nums text-white/90">
                      {row.sign} {formatCurrency(row.value)}
                    </dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-t border-white/15 pt-1 font-medium">
                  <dt className="text-white">Disponível</dt>
                  <dd className="shrink-0 tabular-nums text-white">{formatCurrency(balance)}</dd>
                </div>
              </dl>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/25 sm:flex-none"
            onClick={() => navigate('/app/driver/withdrawals', { state: { openNew: true } })}
          >
            <ArrowDownToLine className="h-4 w-4 shrink-0" /> Retirar
          </button>
          <button
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/25 sm:flex-none"
            onClick={() => setHistoryOpen(true)}
          >
            <History className="h-4 w-4 shrink-0" /> Histórico
          </button>
        </div>
      </div>

      {/* KPIs — no telemóvel o total ocupa a linha toda e as semanas dividem
          a seguinte; três cartões empilhados afastavam demais o gráfico. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Card className="col-span-2 shadow-card sm:col-span-1">
          <CardContent className="p-4 pt-4 sm:p-6 sm:pt-5">
            <p className="mb-1 text-sm text-muted-foreground">Ganhos líquidos</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(netTotal)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {earnings.length} lançamento{earnings.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4 pt-4 sm:p-6 sm:pt-5">
            <p className="mb-1 text-sm text-muted-foreground">Esta semana</p>
            <p className="text-xl font-bold tabular-nums sm:text-2xl">{formatCurrency(thisWeek)}</p>
            {weekTrend !== null ? (
              <p className={`mt-1 flex items-center gap-1 text-xs ${weekTrend >= 0 ? 'text-success' : 'text-destructive'}`}>
                {weekTrend >= 0
                  ? <TrendingUp className="h-3 w-3 shrink-0" />
                  : <TrendingDown className="h-3 w-3 shrink-0" />}
                <span className="truncate">{formatPercent(weekTrend)} vs. anterior</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Desde domingo</p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4 pt-4 sm:p-6 sm:pt-5">
            <p className="mb-1 text-sm text-muted-foreground">Semana anterior</p>
            <p className="text-xl font-bold tabular-nums sm:text-2xl">{formatCurrency(lastWeek)}</p>
            <p className="mt-1 text-xs text-muted-foreground">7 dias antes</p>
          </CardContent>
        </Card>
      </div>

      {/* Quanto ganhou por dia */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-col gap-3 space-y-0 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:p-6">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg">Quanto ganhou por {unit}</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">{PERIOD_LABELS[period]}</p>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-full sm:w-[168px] sm:shrink-0" aria-label="Período do gráfico">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {!hasSeries ? (
            <NotEnoughData onRegister={() => setAddOpen(true)} />
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
                      stroke="var(--muted-foreground)" fontSize={10} width={52}
                      tickLine={false} axisLine={false}
                      tickFormatter={(v) => (v === 0 ? '€0' : formatCurrencyCompact(v))}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--secondary)' }}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={{ color: 'var(--muted-foreground)' }}
                      itemStyle={{ color: 'var(--popover-foreground)' }}
                      formatter={(v: number) => [formatCurrency(v), 'Ganhos']}
                    />
                    <Bar dataKey="total" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={26} />
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

      {/* De onde vem o seu dinheiro */}
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">De onde vem o seu dinheiro</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Últimos 30 dias · {formatCurrency(origin.total)} no total
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
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
                  <li key={s.key} className="flex items-center gap-2 text-sm sm:gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: s.color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    {s.count > 0 && (
                      <span className="hidden shrink-0 text-muted-foreground md:inline">
                        {s.count} lançamento{s.count !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="shrink-0 tabular-nums">{formatCurrency(s.amount)}</span>
                    <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
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
