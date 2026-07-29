// src/app/components/admin/admin-settlements.tsx
//
// Registo semanal de faturação.
//
// A tela alterna entre lista e formulário em vez de abrir um diálogo: o
// formulário tem doze campos e um painel de cálculo, e num diálogo ficaria com
// scroll interno sobre uma lista que ninguém está a ler.
//
// O fecho registado não se edita — é um recibo. As únicas ações sobre ele são
// consultar e cancelar; corrigir significa cancelar e criar outro.

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
  AlertCircle, ArrowLeft, Ban, CheckCircle2, FileText, Loader2,
  Pencil, Plus, ReceiptText, Trash2,
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

/** "2026-07-06T00:00:00.000Z" → "06/07", sem passar por Date. */
function shortDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
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
  const [cancelTarget, setCancelTarget] = useState<ApiSettlement | null>(null);
  const [cancelReason, setCancelReason] = useState('');

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
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível cancelar o fecho.'),
  });

  const { mutate: removeDraft } = useMutation({
    mutationFn: (id: string) => settlementsService.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success('Rascunho apagado.');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível apagar o rascunho.'),
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
            <p className="text-sm text-muted-foreground">
              Registo semanal de faturação
            </p>
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
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <ul>
              {settlements.map((s) => (
                <li key={s.id} className="border-b border-border py-3 last:border-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{s.userName}</p>
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {shortDay(s.weekStart)} a {shortDay(s.weekEnd)}
                        {s.vehiclePlate && (
                          <> · <span className="font-mono tracking-tight">{s.vehiclePlate}</span></>
                        )}
                        {' · '}
                        {formatCurrency(s.grossRevenue)} bruto, {s.commissionRate}% de comissão
                      </p>
                    </div>

                    <p
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        s.status === 'CANCELLED'
                          ? 'text-muted-foreground line-through'
                          : s.netToDriver < 0
                            ? 'text-destructive'
                            : 'text-foreground'
                      }`}
                    >
                      {formatCurrency(s.netToDriver)}
                    </p>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {s.status === 'DRAFT' && (
                        <>
                          <Button
                            size="sm" variant="outline" className="h-8"
                            onClick={() => setMode({ view: 'form', id: s.id })}
                          >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Continuar
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => removeDraft(s.id)}
                            aria-label="Apagar rascunho"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </>
                      )}
                      {s.status === 'REGISTERED' && (
                        <Button
                          size="sm" variant="outline" className="h-8"
                          onClick={() => { setCancelTarget(s); setCancelReason(''); }}
                        >
                          <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Cancelar
                        </Button>
                      )}
                    </div>
                  </div>

                  {s.notes?.trim() && (
                    <p className="mt-2 text-xs text-muted-foreground">{s.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
