// src/app/components/driver/driver-dashboard.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { StatsCard } from '@/app/components/stats-card';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  DollarSign, TrendingUp, Wallet,
  Loader2, AlertCircle, Plus,
} from 'lucide-react';
import {
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import { toast } from 'sonner';
import { earningsService } from '@/features/driver/services/earnings.service';
import { withdrawalsService } from '@/features/driver/services/withdrawals.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { useAuth } from '@/features/auth/context/AuthContext';
import type { ApiEarning, ApiWithdrawal, EarningPlatform } from '@/shared/types/api';

// ── Constantes ────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  UBER:     'Uber',
  BOLT:     'Bolt',
  FREE_NOW: 'Free Now',
  OTHER:    'Outro',
};

const PLATFORMS: { value: EarningPlatform; label: string }[] = [
  { value: 'UBER',     label: 'Uber' },
  { value: 'BOLT',     label: 'Bolt' },
  { value: 'FREE_NOW', label: 'Free Now' },
  { value: 'OTHER',    label: 'Outro' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    const d   = new Date(e.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map[key]  = (map[key] ?? 0) + Number(e.amount);
  });

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

function calcBalance(earnings: ApiEarning[], withdrawals: ApiWithdrawal[]) {
  const totalEarned    = earnings.reduce((s, e) => s + Number(e.amount), 0);
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

  const [amount,   setAmount]   = useState('');
  const [platform, setPlatform] = useState<EarningPlatform>('UBER');
  const [date,     setDate]     = useState(() => new Date().toISOString().slice(0, 10));

  const mutation = useMutation({
    mutationFn: () =>
      earningsService.create({
        amount:   parseFloat(amount),
        platform,
        date,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.earnings.all });
      toast.success('Ganho registado com sucesso!');
      handleClose();
    },
    onError: () => {
      toast.error('Erro ao registar ganho. Tenta novamente.');
    },
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
          {/* Valor */}
          <div className="space-y-1.5">
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input
              id="amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Plataforma */}
          <div className="space-y-1.5">
            <Label>Plataforma</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as EarningPlatform)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Data */}
          <div className="space-y-1.5">
            <Label htmlFor="date">Data</Label>
            <Input
              id="date"
              type="date"
              value={date}
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
            {mutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />A guardar…</>
            ) : (
              'Guardar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function DriverDashboard() {
  const { user }                    = useAuth();
  const [modalOpen, setModalOpen]   = useState(false);

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

  // Cálculos
  const totalEarnings    = earnings.reduce((s, e) => s + Number(e.amount), 0);
  const balance          = calcBalance(earnings, withdrawals);
  const thisWeekStart    = startOfWeek();
  const lastWeekStart    = startOfLastWeek();

  const thisWeekEarnings = earnings
    .filter((e) => new Date(e.date) >= thisWeekStart)
    .reduce((s, e) => s + Number(e.amount), 0);

  const lastWeekEarnings = earnings
    .filter((e) => { const d = new Date(e.date); return d >= lastWeekStart && d < thisWeekStart; })
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

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white ">Olá, {user?.name?.split(' ')[0]} 👋</h2>
          <p className="text-white/60">Aqui está o resumo da sua atividade.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Registar Ganho
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          title="Saldo Disponível"
          value={`€ ${balance.toFixed(2)}`}
          description="Disponível para saque"
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatsCard
          title="Ganhos Totais"
          value={`€ ${totalEarnings.toFixed(2)}`}
          description={`${earnings.length} lançamento${earnings.length !== 1 ? 's' : ''} no histórico`}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <StatsCard
          title="Esta Semana"
          value={`€ ${thisWeekEarnings.toFixed(2)}`}
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
                Nenhum ganho registado ainda.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => {
  if (v === 0) return 'R$0';
  if (v >= 1000) return `R$${(v / 1000).toFixed(1)}k`;
  return `R$${v}`;
}} />
                  <Tooltip formatter={(v: number) => [`€ ${v.toFixed(2)}`, 'Ganhos']} />
                  <Line type="monotone" dataKey="earnings" stroke="#108865" strokeWidth={2} dot={{ fill: '#108865' }} />
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
              Nenhum ganho registado ainda. Clica em "Registar Ganho" para começar.
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
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">
                      + € {Number(earning.amount).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      <AddEarningModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}