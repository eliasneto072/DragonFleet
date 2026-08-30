// src/app/components/admin/earnings-review.tsx
//
// Revisão dos valores comunicados pelos motoristas.
//
// POR QUE ISTO EXISTE: o backend tinha o fluxo completo — PATCH
// /earnings/:id/review, notificação ao motorista, distinção entre confirmado e
// recusado — e nenhuma porta de entrada. O painel anunciava "3 valores
// comunicados por confirmar" e o botão levava à lista de motoristas, que não
// tem nada sobre lançamentos. A linha prometia algo que não existia.
//
// CONFIRMAR NÃO É PAGAR. Estes valores não movimentam saldo em estado nenhum:
// o dinheiro entra apenas pelo fecho semanal. Confirmar significa "confere com
// o que vou fechar"; recusar, "não bate, e o motivo é este". O texto da tela
// diz isto de forma explícita, porque a palavra "aprovar" sugere pagamento.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  AlertCircle, CheckCircle2, ChevronRight, Clock, Info, Loader2, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { earningsService } from '@/features/driver/services/earnings.service';
import { usersService } from '@/features/admin/services/users.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { invalidateAfterEarning } from '@/shared/lib/invalidate';
import { formatCurrency } from '@/shared/lib/format';
import { platformLabel } from '@/shared/lib/platform-labels';
import type { ApiEarning, EarningStatus } from '@/shared/types/api';

const STATUS_META: Record<
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

function StatusBadge({ status }: { status: EarningStatus }) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
      <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/** "2026-07-14" → "14/07/2026", sem passar por Date (evita deslocamento). */
function fullDay(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/');
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function agoLabel(days: number): string {
  if (days === 0) return 'hoje';
  if (days === 1) return 'há 1 dia';
  return `há ${days} dias`;
}

/** Acima disto, a espera passa a ser destacada. */
const OVERDUE_DAYS = 3;

function ReviewSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">A carregar lançamentos…</span>
      <Skeleton className="h-16 w-full rounded-lg" />
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6"><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-8 w-44 shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function EarningsReview() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'all' | EarningStatus>('PENDING');
  const [rejectTarget, setRejectTarget] = useState<ApiEarning | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  const earningsQ = useQuery({
    queryKey: [...queryKeys.earnings.all, 'review'] as const,
    queryFn: () => earningsService.list(),
  });

  const usersQ = useQuery({
    queryKey: queryKeys.users.allUnpaged,
    queryFn: () => usersService.listAll(),
  });

  const users = usersQ.data?.users ?? [];
  const driverName = (userId: string) => users.find((u) => u.id === userId)?.name ?? '—';

  const all = earningsQ.data?.earnings ?? [];

  const listed = useMemo(() => {
    const filtered = statusFilter === 'all'
      ? all
      : all.filter((e) => e.status === statusFilter);

    // Por confirmar primeiro, e dentro disso os mais antigos: quem espera há
    // mais tempo é quem tem de ser visto primeiro.
    return [...filtered].sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === 'PENDING') return -1;
        if (b.status === 'PENDING') return 1;
      }
      return a.date.localeCompare(b.date);
    });
  }, [all, statusFilter]);

  const pendingCount = all.filter((e) => e.status === 'PENDING').length;
  const pendingTotal = all
    .filter((e) => e.status === 'PENDING')
    .reduce((s, e) => s + Number(e.amount), 0);

  const { mutate: review, isPending: reviewing } = useMutation({
    mutationFn: ({ id, status, notes }: {
      id: string; status: 'APPROVED' | 'REJECTED'; notes?: string;
    }) => earningsService.review(id, { status, notes }),
    onSuccess: (_r, vars) => {
      invalidateAfterEarning(queryClient);
      toast.success(
        vars.status === 'APPROVED'
          ? 'Confirmado. Inclua o valor ao fechar a semana.'
          : 'Recusado. O motorista foi notificado.',
      );
      setRejectTarget(null);
      setRejectNotes('');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível concluir a revisão.'),
  });

  if (earningsQ.isLoading) return <ReviewSkeleton />;

  if (earningsQ.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <p className="text-muted-foreground">Erro ao carregar os lançamentos.</p>
        <Button variant="outline" onClick={() => earningsQ.refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">

      {/* O aviso não é decorativo: "aprovar" sugere pagamento, e a distinção
          entre confirmar e creditar é o que impede a semana de ser paga duas
          vezes. */}
      <div className="flex gap-2 rounded-lg border border-border bg-secondary p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          Estes são valores que os motoristas dizem ter feito e que podem não constar
          do relatório da plataforma. <strong className="font-medium text-foreground">
          Confirmar não credita nada</strong> — o dinheiro entra pelo fecho semanal.
          Serve para não deixar nada de fora quando fechar a semana.
        </p>
      </div>

      {pendingCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-4 py-3 dark:bg-amber-950/40">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <strong className="font-semibold">{pendingCount}</strong> por confirmar,
            somando {formatCurrency(pendingTotal)}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[170px] flex-1 space-y-1.5 sm:flex-none">
          <Label htmlFor="earnings-status">Estado</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger id="earnings-status" className="w-full sm:w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Por confirmar</SelectItem>
              <SelectItem value="APPROVED">Confirmados</SelectItem>
              <SelectItem value="REJECTED">Recusados</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">
            {listed.length} lançamento{listed.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {listed.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
              <p className="text-sm font-medium">
                {statusFilter === 'PENDING' ? 'Nada por confirmar' : 'Nenhum lançamento'}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {statusFilter === 'PENDING'
                  ? 'Os motoristas não comunicaram valores em falta.'
                  : 'Nenhum lançamento neste estado.'}
              </p>
            </div>
          ) : (
            <ul>
              {listed.map((e) => {
                const isPending = e.status === 'PENDING';
                const days = daysSince(e.createdAt);
                const overdue = isPending && days >= OVERDUE_DAYS;
                const note = e.notes?.trim();

                return (
                  <li key={e.id} className="border-b border-border py-3 last:border-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/app/admin/drivers/${e.userId}`)}
                        className="min-w-0 flex-1 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/40"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {driverName(e.userId)}
                          </span>
                          <StatusBadge status={e.status} />
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {platformLabel(e.platform)} · {fullDay(e.date)}
                          {isPending && (
                            <span className={overdue ? 'font-medium text-destructive' : ''}>
                              {' · comunicado '}{agoLabel(days)}
                            </span>
                          )}
                        </span>
                      </button>

                      <p className="shrink-0 text-base font-semibold tabular-nums">
                        {formatCurrency(Number(e.amount))}
                      </p>

                      {isPending ? (
                        <div className="flex shrink-0 gap-2">
                          <Button
                            size="sm" className="h-8" disabled={reviewing}
                            onClick={() => review({ id: e.id, status: 'APPROVED' })}
                          >
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            Confirmar
                          </Button>
                          <Button
                            size="sm" variant="outline" className="h-8" disabled={reviewing}
                            onClick={() => { setRejectTarget(e); setRejectNotes(''); }}
                          >
                            <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            Recusar
                          </Button>
                        </div>
                      ) : (
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                    </div>

                    {note && (
                      <p
                        className={`mt-2 rounded-md p-2 text-xs ${
                          e.status === 'REJECTED'
                            ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
                            : 'bg-secondary text-muted-foreground'
                        }`}
                      >
                        {e.status === 'REJECTED'
                          ? <><span className="font-medium">Motivo: </span>{note}</>
                          : <><span className="font-medium">Nota do motorista: </span>{note}</>}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Recusar exige motivo — o servidor devolve NOTES_REQUIRED sem ele. */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectNotes(''); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar lançamento</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  {formatCurrency(Number(rejectTarget.amount))} de{' '}
                  {driverName(rejectTarget.userId)}, {platformLabel(rejectTarget.platform)},
                  em {fullDay(rejectTarget.date)}.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="earning-reject-notes">Motivo</Label>
            <Textarea
              id="earning-reject-notes"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Ex.: este valor já consta do relatório da Uber desta semana."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              O motorista vê este texto. Um &quot;não&quot; sem explicação devolve-lhe a
              mesma dúvida que originou o lançamento.
            </p>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline" disabled={reviewing} className="w-full sm:w-auto"
              onClick={() => { setRejectTarget(null); setRejectNotes(''); }}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={reviewing || !rejectNotes.trim()}
              className="w-full sm:w-auto"
              onClick={() => review({
                id: rejectTarget!.id, status: 'REJECTED', notes: rejectNotes.trim(),
              })}
            >
              {reviewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
