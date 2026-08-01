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
import {
  AlertCircle, CalendarClock, CheckCircle2, ChevronRight, Coins,
  FileText, HandCoins, ReceiptText, TrendingDown, TrendingUp, UserX,
} from 'lucide-react';
import { analyticsService, type ApiOverview } from '@/features/admin/services/analytics.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';

/** Dias inteiros decorridos desde uma data ISO. */
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function agoLabel(days: number | null): string {
  if (days === null) return '';
  if (days === 0) return 'chegou hoje';
  if (days === 1) return 'espera há 1 dia';
  return `espera há ${days} dias`;
}

/** "2026-07-06" e "2026-07-12" → "06/07 a 12/07". */
function weekLabel({ weekStart, weekEnd }: { weekStart: string; weekEnd: string }): string {
  const dm = (d: string) => d.slice(0, 10).split('-').slice(1).reverse().join('/');
  return `${dm(weekStart)} a ${dm(weekEnd)}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ── Linha da fila ─────────────────────────────────────────────────────────────

interface QueueItem {
  key: string;
  icon: typeof FileText;
  title: string;
  detail: string;
  /** Dias de espera; define a ordenação e a cor do detalhe. */
  waiting: number | null;
  actionLabel: string;
  to: string;
  /** Passado ao navegar: pré-preenche o formulário de destino. */
  state?: Record<string, unknown>;
}

/** Acima disto, o item passa a ser destacado como atrasado. */
const OVERDUE_DAYS = 3;

function QueueRow({
  item, onGo,
}: {
  item: QueueItem;
  onGo: (to: string, state?: Record<string, unknown>) => void;
}) {
  const Icon = item.icon;
  const overdue = item.waiting !== null && item.waiting >= OVERDUE_DAYS;

  return (
    <li className="flex items-center gap-3 border-t border-border py-3 first:border-t-0 sm:gap-4">
      <Icon
        className={`h-[19px] w-[19px] shrink-0 ${
          overdue ? 'text-destructive' : 'text-muted-foreground'
        }`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{item.title}</p>
        <p
          className={`truncate text-xs ${
            overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
          }`}
        >
          {item.detail}
        </p>
      </div>
      <Button
        size="sm" variant="outline" className="h-8 shrink-0"
        onClick={() => onGo(item.to, item.state)}
      >
        {item.actionLabel}
      </Button>
    </li>
  );
}

// ── Métrica ───────────────────────────────────────────────────────────────────

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
    const { queue: q } = overview;
    const items: QueueItem[] = [];

    if (q.documentsPending.count > 0) {
      const days = daysSince(q.documentsPending.oldestAt);
      items.push({
        key: 'docs',
        icon: FileText,
        title: `${q.documentsPending.count} documento${q.documentsPending.count !== 1 ? 's' : ''} por rever`,
        detail: `O mais antigo ${agoLabel(days)}`,
        waiting: days,
        actionLabel: 'Rever',
        to: '/app/admin/documents',
      });
    }

    if (q.withdrawalsPending.count > 0) {
      const days = daysSince(q.withdrawalsPending.oldestAt);
      items.push({
        key: 'withdrawals',
        icon: Coins,
        title: `${q.withdrawalsPending.count} retirada${q.withdrawalsPending.count !== 1 ? 's' : ''} pendente${q.withdrawalsPending.count !== 1 ? 's' : ''} · ${formatCurrency(q.withdrawalsPending.total)}`,
        detail: `A mais antiga ${agoLabel(days)}`,
        waiting: days,
        actionLabel: 'Processar',
        to: '/app/admin/financial',
      });
    }

    if (q.driversBlocked > 0) {
      items.push({
        key: 'blocked',
        icon: UserX,
        title: `${q.driversBlocked} motorista${q.driversBlocked !== 1 ? 's' : ''} bloqueado${q.driversBlocked !== 1 ? 's' : ''} por documentação`,
        detail: 'Não podem trabalhar até regularizar',
        waiting: null,
        actionLabel: 'Ver',
        to: '/app/admin/drivers',
      });
    }

    // O fecho é o que faz o motorista receber: uma semana por fechar é uma
    // semana em que ninguém foi pago. Fica no topo, sem idade — não é atraso
    // de dias, é uma tarefa da semana.
    if (q.missingSettlements.count > 0) {
      const names = q.missingSettlements.drivers.map((d) => d.name.split(' ')[0]);
      const extra = q.missingSettlements.count - names.length;
      items.push({
        key: 'settlements',
        icon: ReceiptText,
        title: `${q.missingSettlements.count} motorista${q.missingSettlements.count !== 1 ? 's' : ''} sem fecho da semana passada`,
        detail: `${names.join(', ')}${extra > 0 ? ` e mais ${extra}` : ''} · ${weekLabel(q.missingSettlements)}`,
        waiting: null,
        actionLabel: 'Fechar',
        to: '/app/admin/settlements',
        state: {
          userId: q.missingSettlements.drivers[0]?.id,
          weekStart: q.missingSettlements.weekStart,
          weekEnd: q.missingSettlements.weekEnd,
        },
      });
    }

    if (q.earningsPending.count > 0) {
      const days = daysSince(q.earningsPending.oldestAt);
      items.push({
        key: 'earnings',
        icon: HandCoins,
        title: `${q.earningsPending.count} valor${q.earningsPending.count !== 1 ? 'es' : ''} comunicado${q.earningsPending.count !== 1 ? 's' : ''} por confirmar`,
        detail: `O mais antigo ${agoLabel(days)}`,
        waiting: days,
        actionLabel: 'Rever',
        to: '/app/admin/drivers',
      });
    }

    if (q.documentsExpiringSoon.count > 0) {
      items.push({
        key: 'expiring',
        icon: CalendarClock,
        title: `${q.documentsExpiringSoon.count} documento${q.documentsExpiringSoon.count !== 1 ? 's' : ''} expira${q.documentsExpiringSoon.count !== 1 ? 'm' : ''} em ${q.documentsExpiringSoon.days} dias`,
        detail: 'Avise antes de o motorista parar',
        waiting: null,
        actionLabel: 'Ver',
        to: '/app/admin/documents',
      });
    }

    // Quem espera há mais tempo primeiro; itens sem idade vão para o fim.
    // O fecho é a exceção: sai da ordenação por idade e fica no topo, porque
    // é dele que depende o motorista receber.
    const settlement = items.filter((i) => i.key === 'settlements');
    const rest = items
      .filter((i) => i.key !== 'settlements')
      .sort((a, b) => (b.waiting ?? -1) - (a.waiting ?? -1));
    return [...settlement, ...rest];
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

      {/* Fila de trabalho */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-4 sm:p-6">
          <div>
            <CardTitle className="text-base sm:text-lg">Precisa da sua ação</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Quem espera há mais tempo aparece primeiro
            </p>
          </div>
          {queue.length > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {queue.length} {queue.length === 1 ? 'item' : 'itens'}
            </span>
          )}
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {queue.length === 0 ? (
            // O estado bom merece uma resposta explícita. Metade do valor do
            // painel é saber que está tudo em dia sem verificar cinco telas.
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
              <p className="text-sm font-medium">Nada à espera</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Documentos e retiradas estão em dia.
              </p>
            </div>
          ) : (
            <ul>
              {queue.map((item) => (
                <QueueRow
                  key={item.key}
                  item={item}
                  onGo={(to, state) => navigate(to, state ? { state } : undefined)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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
