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

import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
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
  AlertCircle, ArrowLeft, Ban, Car, CheckCircle2, ChevronRight, Eye, EyeOff,
  FileText, Loader2, Pencil, Plus, ReceiptText, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { settlementsService, type ApiSettlement } from '@/features/admin/services/settlements.service';
import { usersService } from '@/features/admin/services/users.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import type { SettlementStatus } from '@/shared/types/api';
import { SettlementForm } from './settlement-form';

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
          A percentagem de {s.commissionRate}% ficou gravada neste fecho: alterá-la nas
          Configurações não muda esta conta.
        </p>
      </div>
    </div>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export function AdminSettlements() {
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
  const [driverFilter, setDriverFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | SettlementStatus>('all');
  const [detail, setDetail] = useState<ApiSettlement | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ApiSettlement | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ApiSettlement | null>(null);

  const driversQuery = useQuery({
    queryKey: queryKeys.users.list,
    queryFn: () => usersService.list(),
  });
  const drivers = (driversQuery.data?.users ?? []).filter((u) => u.role === 'DRIVER');

  const params = useMemo(
    () => ({
      userId: driverFilter === 'all' ? undefined : driverFilter,
      status: statusFilter === 'all' ? undefined : statusFilter,
    }),
    [driverFilter, statusFilter],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.settlements.list(params.userId, params.status),
    queryFn: () => settlementsService.list(params),
    enabled: mode.view === 'list',
  });
  const settlements = data?.settlements ?? [];

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

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[170px] flex-1 space-y-1.5 sm:flex-none">
          <Label htmlFor="filter-driver">Motorista</Label>
          <Select value={driverFilter} onValueChange={setDriverFilter}>
            <SelectTrigger id="filter-driver" className="w-full sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
            <CardTitle className="text-base sm:text-lg">
              {settlements.length} fecho{settlements.length !== 1 ? 's' : ''}
            </CardTitle>
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
              Se o motorista já tiver levantado o valor, o cancelamento é recusado — nesse
              caso aplique um débito com motivo.
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
