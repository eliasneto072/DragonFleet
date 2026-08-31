// src/app/components/admin/admin-settlements.tsx
//
// Registo semanal de faturação.
//
// A tela alterna entre lista e formulário em vez de abrir um diálogo: o
// formulário tem doze campos e um painel de cálculo, e num diálogo ficaria com
// scroll interno sobre uma lista que ninguém está a ler.
//
// O detalhe, esse, é diálogo: é leitura, cabe num ecrã e fecha-se com Esc.
//
// APAGAR: rascunhos e cancelados. Um fecho registado é a explicação de um
// crédito no saldo — apagá-lo deixaria o dinheiro lá e a razão desaparecida.
// Quem precisa de eliminar um registado cancela primeiro, o que reverte o valor
// e regista o motivo, e só depois apaga.

import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import {
  AlertCircle, ArrowLeft, Ban, Car, CheckCircle2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, EyeOff, FileText, Loader2, Pencil, Plus, ReceiptText, Search, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { settlementsService, type ApiSettlement } from '@/features/admin/services/settlements.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import type { SettlementStatus } from '@/shared/types/api';
import { SettlementForm } from './settlement-form';
import { useListState } from '@/shared/hooks/use-list-state';
import { Pagination } from '@/app/components/ui/list-toolbar';

const STATUS_META: Record<
  SettlementStatus,
  { label: string; icon: typeof CheckCircle2; cls: string }
> = {
  DRAFT: {
    label: 'Rascunho',
    icon: FileText,
    cls: 'bg-secondary text-muted-foreground',
  },
  REGISTERED: {
    label: 'Registado',
    icon: CheckCircle2,
    cls: 'bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  CANCELLED: {
    label: 'Cancelado',
    icon: Ban,
    cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  },
};

function StatusBadge({ status }: { status: SettlementStatus }) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
      <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/** "2026-07-06T00:00:00.000Z" → "06/07". Sem passar por Date: a string é dia
 *  puro, e converter em fuso negativo devolveria a véspera. */
function shortDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

function fullDay(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/');
}

function stamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-PT')} às ${d.toLocaleTimeString('pt-PT', {
    hour: '2-digit', minute: '2-digit',
  })}`;
}

/** Linhas por página. */
/**
 * Registos por página.
 *
 * 25 era o teto de RENDERIZAÇÃO — a tela desenhava 25 e descarregava tudo.
 * Agora é o que se pede ao servidor, e é por isso que o número passou a
 * importar: define o tamanho do pedido, não só o do ecrã.
 *
 * O servidor tem um teto próprio de 200 e ignora qualquer pedido acima disso.
 */
const PAGE_SIZE = 25;

type PeriodKey = 'all' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom';

const PERIOD_LABELS: Record<PeriodKey, string> = {
  all: 'Todo o histórico',
  thisWeek: 'Esta semana',
  lastWeek: 'Semana passada',
  thisMonth: 'Este mês',
  lastMonth: 'Mês passado',
  custom: 'Personalizado',
};

function toInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Intervalo de cada atalho. O filtro incide sobre weekStart, por isso "esta
 * semana" apanha o fecho cuja semana começou nesta segunda — e não os que
 * foram criados nestes dias, que é outra coisa.
 */
function periodRange(period: PeriodKey): { from?: string; to?: string } {
  if (period === 'all' || period === 'custom') return {};

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (period === 'thisWeek' || period === 'lastWeek') {
    const monday = new Date(now);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    if (period === 'lastWeek') monday.setDate(monday.getDate() - 7);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { from: toInput(monday), to: toInput(sunday) };
  }

  const offset = period === 'lastMonth' ? -1 : 0;
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: toInput(first), to: toInput(last) };
}

function ListSkeleton() {
  return (
    <Card className="shadow-card">
      <CardHeader className="p-4 sm:p-6"><Skeleton className="h-5 w-44" /></CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Detalhe ───────────────────────────────────────────────────────────────────

function Row({
  label, value, muted, strong, negative,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className={muted ? 'text-muted-foreground' : ''}>{label}</dt>
      <dd
        className={`shrink-0 tabular-nums ${strong ? 'font-semibold' : ''} ${
          negative ? 'text-destructive' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function SettlementDetail({ s }: { s: ApiSettlement }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={s.status} />
        <span className="text-muted-foreground">
          {fullDay(s.weekStart)} a {fullDay(s.weekEnd)}
        </span>
        {s.vehiclePlate && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Car className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-mono tracking-tight">{s.vehiclePlate}</span>
          </span>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Receitas
        </p>
        <dl className="border-t border-border pt-1">
          <Row label="Uber" value={formatCurrency(s.uberAmount)} />
          <Row label="Bolt" value={formatCurrency(s.boltAmount)} />
          {s.otherRevenue > 0 && (
            <Row label="Outras receitas" value={formatCurrency(s.otherRevenue)} />
          )}
          <div className="border-t border-border">
            <Row label="Total" value={formatCurrency(s.grossRevenue)} strong />
          </div>
        </dl>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Deduções
        </p>
        <dl className="border-t border-border pt-1">
          <Row label="Via Verde" value={`− ${formatCurrency(s.tollsAmount)}`} />
          <Row label="Prio (combustível)" value={`− ${formatCurrency(s.fuelAmount)}`} />
          <Row label="Viatura" value={`− ${formatCurrency(s.vehicleFee)}`} />
          {s.otherDeductions > 0 && (
            <Row label="Outros" value={`− ${formatCurrency(s.otherDeductions)}`} />
          )}
          {/* taxRate nulo = fecho anterior à existência do imposto. Mostrar
              "Imposto 0,00 €" nessas semanas sugeriria que a taxa era zero,
              quando na verdade o campo não existia. */}
          {s.taxRate !== null && (
            <Row
              label={`Imposto (${s.taxRate}% de ${formatCurrency(s.taxBase)})`}
              value={`− ${formatCurrency(s.taxAmount)}`}
            />
          )}
          <div className="border-t border-border">
            <Row label="Despesas" value={`− ${formatCurrency(s.operatingCosts)}`} strong />
          </div>
        </dl>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Resultado
        </p>
        <dl className="border-t border-border pt-1">
          <Row label="Lucro" value={formatCurrency(s.profitBase)} />
          <Row
            label={`Comissão da empresa (${s.commissionRate}%)`}
            value={`− ${formatCurrency(s.commissionAmount)}`}
          />
          <div className="border-t border-border">
            <Row
              label="Creditado ao motorista"
              value={formatCurrency(s.netToDriver)}
              strong
              negative={s.netToDriver < 0}
            />
          </div>
        </dl>
      </div>

      {s.notes?.trim() && (
        <div className="rounded-lg bg-secondary p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Comentários — o motorista vê
          </p>
          <p className="mt-1 text-sm">{s.notes}</p>
        </div>
      )}

      {s.internalNotes?.trim() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            Nota interna — só a administração
          </p>
          <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">{s.internalNotes}</p>
        </div>
      )}

      <div className="space-y-0.5 border-t border-border pt-3 text-xs text-muted-foreground">
        <p>Criado por {s.createdByName ?? '—'} em {stamp(s.createdAt)}</p>
        {s.registeredAt && <p>Registado em {stamp(s.registeredAt)}</p>}
        <p>
          A percentagem de {s.commissionRate}%
          {s.taxRate !== null && ` e o imposto de ${s.taxRate}%`} ficaram gravados neste
          fecho: alterá-los nas Configurações não muda esta conta.
        </p>
      </div>
    </div>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  /** A página passa a trazer o cabeçalho quando há abas por cima. */
  hideHeader?: boolean;
}

export function AdminSettlements({ hideHeader = false }: Props) {
  const queryClient = useQueryClient();
  const location = useLocation();

  // O painel encaminha para cá com o motorista e a semana já escolhidos.
  const prefill = (location.state ?? {}) as {
    userId?: string;
    weekStart?: string;
    weekEnd?: string;
  };

  const [mode, setMode] = useState<{ view: 'list' } | { view: 'form'; id?: string }>(
    prefill.userId ? { view: 'form' } : { view: 'list' },
  );
  // Pesquisa e página no ENDEREÇO. Recarregar não perde o que se procurava, e
  // dá para mandar um link com a busca já feita.
  const lista = useListState({ defaults: {} });
  const [statusFilter, setStatusFilter] = useState<'all' | SettlementStatus>('all');
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [detail, setDetail] = useState<ApiSettlement | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ApiSettlement | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ApiSettlement | null>(null);



  const params = useMemo(() => {
    const range = period === 'custom'
      ? { from: customFrom || undefined, to: customTo || undefined }
      : periodRange(period);
    return {
      status: statusFilter === 'all' ? undefined : statusFilter,
      ...range,
    };
  }, [statusFilter, period, customFrom, customTo]);

  // A página vive no estado da tela e entra na chave da consulta, para o
  // React Query tratar cada página como um resultado próprio e conseguir
  // servir a anterior da cache quando se volta atrás.

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    // O período entra na chave, senão trocar de filtro devolveria a cache do
    // intervalo anterior.
    queryKey: [
      ...queryKeys.settlements.list(undefined, params.status),
      params.from ?? 'any', params.to ?? 'any', lista.search, lista.page,
    ] as const,
    queryFn: () => settlementsService.list({
      ...params,
      search: lista.search || undefined,
      page: lista.page,
      pageSize: PAGE_SIZE,
    }),
    // Sem isto, mudar de página piscava o esqueleto entre as duas. Manter o
    // resultado anterior enquanto o novo chega faz a tabela ficar quieta.
    placeholderData: (anterior) => anterior,
    enabled: mode.view === 'list',
  });
  const all = data?.settlements ?? [];

  /**
   * Os totais vêm do SERVIDOR e cobrem o filtro inteiro, não a página.
   *
   * Eram somados aqui, percorrendo a lista toda — e era essa soma que obrigava
   * o servidor a mandar os 88 mil fechos. O Postgres faz a mesma conta em 32ms.
   *
   * A regra mantém-se: só os registados contam. Rascunhos ainda não creditaram
   * nada e cancelados foram revertidos.
   */
  const registeredTotal = data?.totals.credited ?? 0;
  const registeredCount = data?.totals.registeredCount ?? 0;
  const totalFechos = data?.page.total ?? 0;
  const pageInfo = data?.page;

  // Teto de linhas. Com cinquenta motoristas ao fim de um ano são 2.600
  // fechos, e a tela renderizaria todos. Quem procura um específico usa os
  // filtros — é para isso que eles existem.
  const settlements = all;

  // Repõe o limite quando os filtros mudam: sem isto, filtrar mantinha
  // abertas as linhas extra de uma pesquisa anterior.
  useEffect(() => {
    lista.setPage(1);
  }, [statusFilter, period, customFrom, customTo]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.settlements.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.balance.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
  };

  const { mutate: cancel, isPending: cancelling } = useMutation({
    mutationFn: () => settlementsService.cancel(cancelTarget!.id, cancelReason.trim()),
    onSuccess: () => {
      invalidate();
      toast.success('Fecho cancelado. O crédito foi revertido.');
      setCancelTarget(null);
      setCancelReason('');
      setDetail(null);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível cancelar o fecho.'),
  });

  const { mutate: remove, isPending: removing } = useMutation({
    mutationFn: (id: string) => settlementsService.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success('Fecho apagado.');
      setDeleteTarget(null);
      setDetail(null);
    },
    onError: (err: any) => {
      setDeleteTarget(null);
      toast.error(err?.message ?? 'Não foi possível apagar o fecho.');
    },
  });

  // ── Formulário ──────────────────────────────────────────────────────────────

  if (mode.view === 'form') {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost" size="sm" className="mt-0.5 shrink-0"
            onClick={() => setMode({ view: 'list' })}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Voltar
          </Button>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-foreground sm:text-2xl">
              {mode.id ? 'Editar rascunho' : 'Novo fecho'}
            </h2>
            <p className="text-sm text-muted-foreground">Registo semanal de faturação</p>
          </div>
        </div>

        <SettlementForm
          settlementId={mode.id}
          initialUserId={prefill.userId}
          initialWeek={
            prefill.weekStart && prefill.weekEnd
              ? { start: prefill.weekStart, end: prefill.weekEnd }
              : undefined
          }
          onDone={() => setMode({ view: 'list' })}
        />
      </div>
    );
  }

  // ── Lista ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 sm:space-y-6">
      {hideHeader ? (
        <div className="flex justify-end">
          <Button className="w-full sm:w-auto" onClick={() => setMode({ view: 'form' })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />Novo fecho
          </Button>
        </div>
      ) : (
        <PageHeader
          title="Registo semanal de faturação"
          subtitle="Fechos por motorista e por semana"
          icon={<ReceiptText className="h-5 w-5" />}
          actions={
            <Button className="w-full sm:w-auto" onClick={() => setMode({ view: 'form' })}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />Novo fecho
            </Button>
          }
        />
      )}

      <div className="flex flex-wrap items-end gap-3">
        {/* Pesquisa livre em vez de um seletor com DOIS MIL nomes.
            
            O menu anterior era uma lista rolável de toda a frota: para chegar
            a alguém a meio do alfabeto era preciso rolar centenas de linhas, e
            não tinha pesquisa nenhuma. Escrever três letras chega lá mais
            depressa do que qualquer lista, por melhor ordenada que esteja.
            
            E deixa de ser preciso descarregar os 2000 nomes só para desenhar
            o menu. */}
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <Label htmlFor="filter-search">Motorista</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="filter-search"
              type="search"
              placeholder="Procurar por nome ou email…"
              className="pl-9 pr-9"
              value={lista.searchInput}
              onChange={(e) => lista.setSearchInput(e.target.value)}
            />
            {lista.searchInput && (
              <button
                type="button"
                onClick={() => lista.setSearchInput('')}
                aria-label="Limpar pesquisa"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="min-w-[170px] flex-1 space-y-1.5 sm:flex-none">
          <Label htmlFor="filter-period">Período</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
            <SelectTrigger id="filter-period" className="w-full sm:w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((p) => (
                <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {period === 'custom' && (
          <>
            <div className="min-w-[140px] flex-1 space-y-1.5 sm:flex-none">
              <Label htmlFor="filter-from">De</Label>
              <Input
                id="filter-from" type="date" value={customFrom} max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full sm:w-40"
              />
            </div>
            <div className="min-w-[140px] flex-1 space-y-1.5 sm:flex-none">
              <Label htmlFor="filter-to">Até</Label>
              <Input
                id="filter-to" type="date" value={customTo} min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full sm:w-40"
              />
            </div>
          </>
        )}

        <div className="min-w-[150px] flex-1 space-y-1.5 sm:flex-none">
          <Label htmlFor="filter-status">Estado</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as 'all' | SettlementStatus)}
          >
            <SelectTrigger id="filter-status" className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="DRAFT">Rascunho</SelectItem>
              <SelectItem value="REGISTERED">Registado</SelectItem>
              <SelectItem value="CANCELLED">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Paginação também em cima: com 25 linhas, obrigar a rolar até ao fim
          para mudar de página é atrito a cada consulta. A variante compacta
          larga o "1 / 3529" para não competir com a barra de baixo. */}
      {pageInfo && pageInfo.totalPages > 1 && (
        <Pagination
          info={pageInfo} onChange={lista.setPage} busy={isFetching} compact
        />
      )}

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
          <p className="text-muted-foreground">Erro ao carregar os fechos.</p>
          <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      ) : settlements.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <ReceiptText className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Nenhum fecho neste filtro</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              O fecho semanal é a única forma de creditar saldo a um motorista.
            </p>
            <Button variant="outline" size="sm" onClick={() => setMode({ view: 'form' })}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Criar o primeiro
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-card">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <CardTitle className="text-base sm:text-lg">
                {totalFechos} fecho{totalFechos !== 1 ? 's' : ''}
              </CardTitle>
              {registeredCount > 0 && (
                <p className="text-sm text-muted-foreground">
                  <strong className="font-semibold tabular-nums text-foreground">
                    {formatCurrency(registeredTotal)}
                  </strong>{' '}
                  creditados em {registeredCount} fecho{registeredCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Toque numa linha para ver o detalhe
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <ul>
              {settlements.map((s) => (
                <li key={s.id} className="border-b border-border py-1 last:border-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                    {/* A área de leitura é o botão; as ações ficam fora dele,
                        senão clicar em "Apagar" abriria também o detalhe. */}
                    <button
                      type="button"
                      onClick={() => setDetail(s)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-muted/40"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{s.userName}</span>
                          <StatusBadge status={s.status} />
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {shortDay(s.weekStart)} a {shortDay(s.weekEnd)}
                          {s.vehiclePlate && (
                            <> · <span className="font-mono tracking-tight">{s.vehiclePlate}</span></>
                          )}
                          {' · '}
                          {formatCurrency(s.grossRevenue)} bruto, {s.commissionRate}% de comissão
                        </span>
                      </span>

                      <span
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          s.status === 'CANCELLED'
                            ? 'text-muted-foreground line-through'
                            : s.netToDriver < 0
                              ? 'text-destructive'
                              : 'text-foreground'
                        }`}
                      >
                        {formatCurrency(s.netToDriver)}
                      </span>

                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {s.status === 'DRAFT' && (
                        <Button
                          size="sm" variant="outline" className="h-8"
                          onClick={() => setMode({ view: 'form', id: s.id })}
                        >
                          <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Continuar
                        </Button>
                      )}
                      {s.status === 'REGISTERED' && (
                        <Button
                          size="sm" variant="outline" className="h-8"
                          onClick={() => { setCancelTarget(s); setCancelReason(''); }}
                        >
                          <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Cancelar
                        </Button>
                      )}
                      {s.status !== 'REGISTERED' && (
                        <Button
                          size="sm" variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleteTarget(s)}
                          aria-label="Apagar fecho"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Páginas numeradas e não "mostrar mais": esta é uma tela de
                trabalho onde se procura um fecho, e com 88 mil registos
                ninguém chega ao fim a carregar num botão. Saber em que página
                se está, e poder saltar para o fim, é o que se espera de uma
                listagem de contabilidade. */}
            {pageInfo && pageInfo.totalPages > 1 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground tabular-nums">
                  Página {pageInfo.page} de {pageInfo.totalPages} · {pageInfo.total} no total
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm" variant="outline" className="h-8 px-2"
                    disabled={pageInfo.page <= 1 || isFetching}
                    onClick={() => lista.setPage(1)}
                    aria-label="Primeira página"
                  >
                    <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm" variant="outline" className="h-8 px-2"
                    disabled={pageInfo.page <= 1 || isFetching}
                    onClick={() => lista.setPage(pageInfo.page - 1)}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm" variant="outline" className="h-8 px-2"
                    disabled={!pageInfo.hasMore || isFetching}
                    onClick={() => lista.setPage(pageInfo.page + 1)}
                    aria-label="Página seguinte"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm" variant="outline" className="h-8 px-2"
                    disabled={!pageInfo.hasMore || isFetching}
                    onClick={() => lista.setPage(pageInfo.totalPages)}
                    aria-label="Última página"
                  >
                    <ChevronsRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detalhe */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.userName}</DialogTitle>
            <DialogDescription>Detalhe do fecho semanal</DialogDescription>
          </DialogHeader>

          {detail && <SettlementDetail s={detail} />}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDetail(null)}>
              Fechar
            </Button>
            {detail?.status === 'DRAFT' && (
              <Button
                className="w-full sm:w-auto"
                onClick={() => { setMode({ view: 'form', id: detail.id }); setDetail(null); }}
              >
                <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />Continuar edição
              </Button>
            )}
            {detail?.status === 'REGISTERED' && (
              <Button
                variant="destructive" className="w-full sm:w-auto"
                onClick={() => { setCancelTarget(detail); setCancelReason(''); }}
              >
                <Ban className="mr-1.5 h-4 w-4" aria-hidden="true" />Cancelar fecho
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancelar reverte o crédito — o servidor recusa se o dinheiro já saiu. */}
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(o) => { if (!o) { setCancelTarget(null); setCancelReason(''); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar fecho</DialogTitle>
            <DialogDescription>
              {cancelTarget && (
                <>
                  {formatCurrency(cancelTarget.netToDriver)} de {cancelTarget.userName},
                  semana de {shortDay(cancelTarget.weekStart)} a {shortDay(cancelTarget.weekEnd)}.
                  O valor será retirado do saldo.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Motivo</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Por que este fecho está a ser cancelado."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Se o motorista já tiver levantado o valor, o saldo dele fica negativo e será
              descontado dos próximos fechos.
            </p>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline" disabled={cancelling} className="w-full sm:w-auto"
              onClick={() => { setCancelTarget(null); setCancelReason(''); }}
            >
              Voltar
            </Button>
            <Button
              variant="destructive" disabled={cancelling} className="w-full sm:w-auto"
              onClick={() => cancel()}
            >
              {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Cancelar fecho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apagar — só rascunhos e cancelados chegam aqui. */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar este fecho?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.status === 'CANCELLED'
                ? 'O fecho já está cancelado e não afeta nenhum saldo. Apagá-lo remove-o do histórico em definitivo.'
                : 'O rascunho será removido. Nada foi creditado, por isso nenhum saldo muda.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={removing}
              onClick={(e) => { e.preventDefault(); remove(deleteTarget!.id); }}
            >
              {removing && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
