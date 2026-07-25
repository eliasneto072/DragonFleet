// src/app/components/driver/driver-dashboard.tsx
//
// Design System v2 ("Variation A"):
// - Hero de saldo em verde profundo com ilustração vetorial e ações rápidas
// - Cards de KPI neutros com profundidade
// - Breakdown de ganhos por plataforma (linhas com % de participação)
// - Moeda unificada em formatCurrency() — resolve a antiga mistura €/R$
//
// Saldo: usa GET /balance/:userId (mesma fonte do admin, inclui ajustes).
// O endpoint devolve o BalanceSummary completo, então o hero consegue abrir
// a composição do saldo sem nenhuma chamada extra.
//
// Notas de manutenção:
// - O hero é um flex de duas colunas: conteúdo à esquerda, ilustração à
//   direita como item próprio. A ilustração NÃO é posicionada em absolute —
//   assim ela nunca sangra para fora do card nem cobre os botões.
// - O gradiente do hero é fixo e NÃO acompanha o modo escuro (em dark a escala
//   de marca clareia, e um hero mais claro no escuro fica errado). Por isso
//   todo texto dentro do hero usa branco com opacidade, nunca text-brand-*,
//   que inverteria enquanto o fundo permanece igual.
// - Todas as leituras de data passam por parseLocalDate. Ver o comentário do
//   helper: new Date("2026-06-21") parseia como meia-noite UTC e pode deslocar
//   um ganho para o dia/semana errados perto da virada.

import { useState } from 'react';
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
  ArrowDownToLine, History, ChevronDown,
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
import { WalletIllustration } from '@/app/components/ui/wallet-illustration';
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
//
// IMPORTANTE: todo lugar que lê e.date precisa usar isto. Os builders de
// gráfico usavam new Date() direto e reintroduziam o bug que este helper
// existe para corrigir.
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
    const d = parseLocalDate(e.date);
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

// Conta REGISTOS de ganho por dia da semana, não corridas: o modal de registo
// pede valor + plataforma + data, então um registo costuma ser o total do dia
// numa plataforma. Os rótulos falam em "lançamentos" por esse motivo.
function buildWeeklyData(earnings: ApiEarning[]) {
  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const map = Object.fromEntries(DAYS.map((d) => [d, 0]));
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 30);

  earnings
    .filter((e) => parseLocalDate(e.date) >= cutoff)
    .forEach((e) => {
      const day = DAYS[parseLocalDate(e.date).getDay()];
      map[day] += 1;
    });

  return DAYS.map((day) => ({ day, lancamentos: map[day] }));
}

/** Ganhos agrupados por plataforma nos últimos `days`, com % de participação. */
function buildPlatformBreakdown(earnings: ApiEarning[], days = 30) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);

  const totals: Record<string, { amount: number; count: number }> = {};
  let grand = 0;

  earnings
    .filter((e) => parseLocalDate(e.date) >= cutoff)
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

// ── Skeleton ──────────────────────────────────────────────────────────────────

// Espelha a estrutura real da tela: mesmo número de cards, mesmas alturas de
// gráfico. Um skeleton que não bate com o layout final causa um salto visível
// quando os dados chegam.
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
        <CardHeader><Skeleton className="h-5 w-44" /></CardHeader>
        <CardContent className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-1.5 w-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="shadow-card">
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent><Skeleton className="h-[300px] w-full" /></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
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
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

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

  if (isLoading) return <DashboardSkeleton />;

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
  const summary = balanceQuery.data?.balance;

  // Cálculos
  const totalEarnings = earnings.reduce((s, e) => s + Number(e.amount), 0);
  // Fonte única de verdade: mesmo endpoint que o admin usa (inclui ajustes).
  // Fallback para o cálculo local enquanto a query de saldo carrega.
  const balance = summary?.available ?? calcBalance(earnings, withdrawals);

  // Composição do saldo. Serve para o motorista conferir a conta sem abrir
  // chamado — todos os campos já vêm do mesmo GET /balance/:userId.
  const breakdownRows: { label: string; value: number; sign: '+' | '−' }[] = summary
    ? [
        { label: 'Ganhos registados', value: summary.totalEarnings, sign: '+' },
        ...(summary.totalCredits > 0
          ? [{ label: 'Ajustes a crédito', value: summary.totalCredits, sign: '+' as const }]
          : []),
        ...(summary.totalDebits > 0
          ? [{ label: 'Ajustes a débito', value: summary.totalDebits, sign: '−' as const }]
          : []),
        ...(summary.totalWithdrawn > 0
          ? [{ label: 'Já retirado', value: summary.totalWithdrawn, sign: '−' as const }]
          : []),
        ...(summary.pendingWithdrawals > 0
          ? [{ label: 'Retiradas em análise', value: summary.pendingWithdrawals, sign: '−' as const }]
          : []),
      ]
    : [];

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

  // Variação DESTA semana em relação à ANTERIOR. Positivo = esta semana maior.
  // Fica no card "Esta semana", não no hero: é variação de ganhos, não de saldo.
  const weekTrend =
    lastWeekEarnings > 0
      ? ((thisWeekEarnings - lastWeekEarnings) / lastWeekEarnings) * 100
      : null;

  const monthlyData = buildMonthlyData(earnings);
  const weeklyData = buildWeeklyData(earnings);
  const platformBreakdown = buildPlatformBreakdown(earnings);
  const recentFive = [...earnings]
    .sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime())
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

      {/* Hero: saldo + composição + ações */}
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
                onClick={() => navigate('/app/driver/withdrawals')}
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

      {/* KPIs neutros */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-1">Ganhos totais</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(totalEarnings)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {earnings.length} lançamento{earnings.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-1">Esta semana</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(thisWeekEarnings)}</p>
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
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(lastWeekEarnings)}</p>
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
                            {row.count} lançamento{row.count !== 1 ? 's' : ''}
                          </span>
                        </span>
                        <span className="text-muted-foreground tabular-nums">{formatCurrency(row.amount)}</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${row.share}%`, background: badge.bg }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right shrink-0 tabular-nums">
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
          <CardHeader><CardTitle>Lançamentos por dia da semana</CardTitle></CardHeader>
          <CardContent>
            {weeklyData.every((d) => d.lancamentos === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                Nenhum lançamento nos últimos 30 dias.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip formatter={(v: number) => [v, 'Lançamentos']} />
                  <Bar dataKey="lancamentos" fill="#108865" radius={[6, 6, 0, 0]} />
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
                    <p className="font-semibold text-success tabular-nums">
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
