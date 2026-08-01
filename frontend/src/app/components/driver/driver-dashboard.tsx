// src/app/components/driver/driver-dashboard.tsx
//
// Painel do motorista, construído sobre os FECHOS SEMANAIS.
//
// MUDANÇA DE FUNDO: a versão anterior somava os lançamentos do próprio
// motorista. Esses lançamentos deixaram de creditar — passaram a ser
// conferência para quem fecha a semana — e o dinheiro entra apenas pelos
// fechos registados pela administração. Somá-los aqui mostrava um total que já
// não correspondia ao saldo, e um motorista que não comunicasse nada via o
// gráfico vazio enquanto o saldo subia todas as semanas.
//
// A tela responde às três perguntas dele, por esta ordem: quanto tenho, como
// correu cada semana, e o que já comuniquei.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  AlertCircle, ArrowDownToLine, CalendarRange, CheckCircle2, ChevronDown,
  ChevronRight, Clock, History, Lightbulb, Loader2, Plus, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/context/AuthContext';
import { earningsService } from '@/features/driver/services/earnings.service';
import { settlementsService, type ApiSettlement } from '@/features/admin/services/settlements.service';
import { balanceService } from '@/features/admin/services/balance.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency, formatCurrencyCompact } from '@/shared/lib/format';
import { PLATFORM_OPTIONS, platformLabel } from '@/shared/lib/platform-labels';
import { WalletIllustration } from '@/app/components/ui/wallet-illustration';
import type { ApiEarning, EarningPlatform, EarningStatus } from '@/shared/types/api';

const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  boxShadow: 'var(--shadow-md)',
};

/** "2026-07-06T00:00:00.000Z" → "06/07". Sem passar por Date: a string é dia
 *  puro, e converter em fuso negativo devolveria a véspera. */
function shortDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

function fullDay(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/');
}

// ── Estado do lançamento ──────────────────────────────────────────────────────

const EARNING_STATUS: Record<
  EarningStatus,
  { label: string; icon: typeof CheckCircle2; cls: string }
> = {
  PENDING: {
    label: 'Por confirmar',
    icon: Clock,
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  APPROVED: {
    label: 'Confirmado',
    icon: CheckCircle2,
    cls: 'bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  REJECTED: {
    label: 'Recusado',
    icon: XCircle,
    cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  },
};

function EarningBadge({ status }: { status: EarningStatus }) {
  const meta = EARNING_STATUS[status];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
      <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

// ── Comunicar um valor ────────────────────────────────────────────────────────

function ReportEarningModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [platform, setPlatform] = useState<EarningPlatform>('UBER');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      earningsService.create({
        amount: parseFloat(amount),
        platform,
        date,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.earnings.all });
      toast.success('Comunicado. O escritório vai confirmar no fecho da semana.');
      handleClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao comunicar o valor.'),
  });

  function handleClose() {
    setAmount('');
    setPlatform('UBER');
    setDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registar ganho</DialogTitle>
          <DialogDescription>
            O valor entra na conta quando o escritório fechar a semana. Isto serve para
            garantir que nada fica de fora.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Valor (€)</Label>
            <Input
              id="amount" type="number" min="0.01" step="0.01" placeholder="0,00"
              inputMode="decimal"
              value={amount} onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="platform">Plataforma</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as EarningPlatform)}>
              <SelectTrigger id="platform"><SelectValue /></SelectTrigger>
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

          <div className="space-y-1.5">
            <Label htmlFor="notes">Observação</Label>
            <Textarea
              id="notes" rows={2}
              placeholder="Ex.: corrida de sábado à noite que não apareceu no relatório."
              value={notes} onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="outline" onClick={handleClose} disabled={isPending}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            onClick={() => {
              const v = parseFloat(amount);
              if (!amount || isNaN(v) || v <= 0) { toast.error('Insere um valor válido.'); return; }
              mutate();
            }}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {isPending
              ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />A enviar…</>)
              : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Detalhe de uma semana ─────────────────────────────────────────────────────

function WeekRow({ label, value, muted, strong, negative }: {
  label: string; value: string; muted?: boolean; strong?: boolean; negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className={muted ? 'text-muted-foreground' : ''}>{label}</dt>
      <dd className={`shrink-0 tabular-nums ${strong ? 'font-semibold' : ''} ${negative ? 'text-destructive' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function WeekDetail({ s }: { s: ApiSettlement }) {
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        {fullDay(s.weekStart)} a {fullDay(s.weekEnd)}
        {s.vehiclePlate && (
          <> · <span className="font-mono tracking-tight">{s.vehiclePlate}</span></>
        )}
      </p>

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          O que entrou
        </p>
        <dl className="border-t border-border pt-1">
          <WeekRow label="Uber" value={formatCurrency(s.uberAmount)} />
          <WeekRow label="Bolt" value={formatCurrency(s.boltAmount)} />
          {s.otherRevenue > 0 && (
            <WeekRow label="Outras receitas" value={formatCurrency(s.otherRevenue)} />
          )}
          <div className="border-t border-border">
            <WeekRow label="Total" value={formatCurrency(s.grossRevenue)} strong />
          </div>
        </dl>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          O que saiu
        </p>
        <dl className="border-t border-border pt-1">
          <WeekRow label="Via Verde" value={`− ${formatCurrency(s.tollsAmount)}`} />
          <WeekRow label="Combustível" value={`− ${formatCurrency(s.fuelAmount)}`} />
          <WeekRow label="Viatura" value={`− ${formatCurrency(s.vehicleFee)}`} />
          {s.otherDeductions > 0 && (
            <WeekRow label="Outros" value={`− ${formatCurrency(s.otherDeductions)}`} />
          )}
          <div className="border-t border-border">
            <WeekRow label="Despesas" value={`− ${formatCurrency(s.operatingCosts)}`} strong />
          </div>
        </dl>
      </div>

      <div>
        <dl className="border-t border-border pt-1">
          <WeekRow label="Lucro da semana" value={formatCurrency(s.profitBase)} />
          <WeekRow
            label={`Comissão da empresa (${s.commissionRate}%)`}
            value={`− ${formatCurrency(s.commissionAmount)}`}
          />
          <div className="border-t border-border">
            <WeekRow
              label="Ficou para si"
              value={formatCurrency(s.netToDriver)}
              strong
              negative={s.netToDriver < 0}
            />
          </div>
        </dl>
      </div>

      {s.notes?.trim() && (
        <div className="rounded-lg bg-secondary p-3">
          <p className="text-xs font-medium text-muted-foreground">Observações do escritório</p>
          <p className="mt-1 text-sm">{s.notes}</p>
        </div>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" role="status" aria-busy="true">
      <span className="sr-only">A carregar o painel…</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-9 w-full sm:w-36" />
      </div>
      <Skeleton className="h-52 w-full rounded-xl sm:h-48" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i} className={`shadow-card ${i === 0 ? 'col-span-2 sm:col-span-1' : ''}`}>
            <CardContent className="space-y-2 p-4 sm:p-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-28" />
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
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function DriverDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [reportOpen, setReportOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [weekDetail, setWeekDetail] = useState<ApiSettlement | null>(null);

  const settlementsQuery = useQuery({
    queryKey: queryKeys.settlements.list(user?.id, 'REGISTERED'),
    queryFn: () => settlementsService.list({ status: 'REGISTERED' }),
    enabled: !!user?.id,
  });

  const balanceQuery = useQuery({
    queryKey: queryKeys.balance.summary(user?.id ?? ''),
    queryFn: () => balanceService.getSummary(user!.id),
    enabled: !!user?.id,
  });

  const earningsQuery = useQuery({
    queryKey: queryKeys.earnings.list,
    queryFn: () => earningsService.list(),
  });

  const settlements = settlementsQuery.data?.settlements ?? [];
  const summary = balanceQuery.data?.balance;
  const earnings: ApiEarning[] = earningsQuery.data?.earnings ?? [];

  // Mais recente primeiro na lista; o gráfico inverte para ler da esquerda.
  const weeks = useMemo(
    () => [...settlements].sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    [settlements],
  );

  const series = useMemo(
    () =>
      [...weeks]
        .slice(0, 12)
        .reverse()
        .map((s) => ({
          label: shortDay(s.weekStart),
          total: Math.round(s.netToDriver * 100) / 100,
        })),
    [weeks],
  );

  const pendingEarnings = earnings.filter((e) => e.status === 'PENDING');

  if (settlementsQuery.isLoading) return <DashboardSkeleton />;

  if (settlementsQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <p className="text-muted-foreground">Erro ao carregar o painel.</p>
        <Button variant="outline" onClick={() => settlementsQuery.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const balance = summary?.available ?? 0;
  const lastWeek = weeks[0];
  const totalReceived = weeks.reduce((s, w) => s + w.netToDriver, 0);
  const average = weeks.length ? totalReceived / weeks.length : 0;

  const breakdownRows: { label: string; value: number; sign: '+' | '−' }[] = summary
    ? [
        { label: 'Fechos semanais', value: summary.totalSettlements, sign: '+' },
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
        <Button onClick={() => setReportOpen(true)} className="w-full sm:w-auto sm:shrink-0">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />Registar ganho
        </Button>
      </div>

      {/* Saldo */}
      <div
        className="overflow-hidden rounded-xl p-5 shadow-brand sm:p-6"
        style={{ background: 'linear-gradient(135deg, #0d6b4f 0%, #0a5440 100%)' }}
      >
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/70">Saldo disponível para retirada</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-white tabular-nums sm:text-4xl">
              {formatCurrency(balance)}
            </p>
          </div>
          <WalletIllustration
            tone="brand" surface="dark"
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
            onClick={() => navigate('/app/driver/withdrawals')}
          >
            <History className="h-4 w-4 shrink-0" /> Histórico
          </button>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Card className="col-span-2 shadow-card sm:col-span-1">
          <CardContent className="p-4 pt-4 sm:p-6 sm:pt-5">
            <p className="mb-1 text-sm text-muted-foreground">Última semana fechada</p>
            <p className="text-2xl font-bold tabular-nums">
              {lastWeek ? formatCurrency(lastWeek.netToDriver) : '—'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {lastWeek
                ? `${shortDay(lastWeek.weekStart)} a ${shortDay(lastWeek.weekEnd)}`
                : 'Ainda sem fechos'}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4 pt-4 sm:p-6 sm:pt-5">
            <p className="mb-1 text-sm text-muted-foreground">Média por semana</p>
            <p className="text-xl font-bold tabular-nums sm:text-2xl">
              {formatCurrency(average)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {weeks.length} semana{weeks.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4 pt-4 sm:p-6 sm:pt-5">
            <p className="mb-1 text-sm text-muted-foreground">Total recebido</p>
            <p className="text-xl font-bold tabular-nums sm:text-2xl">
              {formatCurrency(totalReceived)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Desde o início</p>
          </CardContent>
        </Card>
      </div>

      {/* Evolução semanal */}
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Quanto recebeu por semana</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Depois de descontadas as despesas e a comissão
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {series.length < 2 ? (
            <div className="flex flex-col items-center gap-2.5 px-2 py-8 text-center">
              <CalendarRange className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="max-w-md text-sm text-muted-foreground">
                {series.length === 0
                  ? 'Ainda não há semanas fechadas. Assim que o escritório fechar a primeira, ela aparece aqui.'
                  : 'Com duas semanas fechadas o gráfico começa a mostrar a evolução.'}
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
                      formatter={(v: number) => [formatCurrency(v), 'Recebido']}
                      labelFormatter={(l) => `Semana de ${l}`}
                    />
                    <Bar dataKey="total" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Média de <strong className="font-medium text-foreground">{formatCurrency(average)}</strong> por
                  semana nas {weeks.length} semanas fechadas.
                </span>
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Semanas */}
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">As suas semanas</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Toque para ver o detalhe de receitas e despesas
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {weeks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma semana fechada ainda.
            </p>
          ) : (
            <ul>
              {weeks.slice(0, 10).map((s) => (
                <li key={s.id} className="border-b border-border py-1 last:border-0">
                  <button
                    type="button"
                    onClick={() => setWeekDetail(s)}
                    className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {shortDay(s.weekStart)} a {shortDay(s.weekEnd)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatCurrency(s.grossRevenue)} em corridas
                        {' · '}
                        {formatCurrency(s.operatingCosts + s.commissionAmount)} de descontos
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        s.netToDriver < 0 ? 'text-destructive' : 'text-foreground'
                      }`}
                    >
                      {formatCurrency(s.netToDriver)}
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Comunicações */}
      {earnings.length > 0 && (
        <Card className="shadow-card">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Valores que comunicou</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {pendingEarnings.length > 0
                ? `${pendingEarnings.length} por confirmar pelo escritório`
                : 'Entram no fecho da semana correspondente'}
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <ul>
              {earnings.slice(0, 6).map((e) => (
                <li key={e.id} className="border-b border-border py-2.5 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{platformLabel(e.platform)}</p>
                        <EarningBadge status={e.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {fullDay(e.date)}
                        {e.notes?.trim() && ` · ${e.notes}`}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatCurrency(e.amount)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ReportEarningModal open={reportOpen} onClose={() => setReportOpen(false)} />

      {/* Detalhe da semana */}
      <Dialog open={!!weekDetail} onOpenChange={(o) => { if (!o) setWeekDetail(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhe da semana</DialogTitle>
            <DialogDescription>Tudo o que entrou e saiu neste período</DialogDescription>
          </DialogHeader>
          {weekDetail && <WeekDetail s={weekDetail} />}
          <DialogFooter>
            <Button
              variant="outline" className="w-full sm:w-auto"
              onClick={() => setWeekDetail(null)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
