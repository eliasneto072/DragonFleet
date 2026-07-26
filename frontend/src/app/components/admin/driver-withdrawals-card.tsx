// src/app/components/admin/driver-withdrawals-card.tsx
//
// Retiradas de um motorista, com aprovação e rejeição, para a página de
// detalhe do admin.
//
// POR QUE EXISTE: a página de detalhe resolvia documentos, estado da conta e
// saldo, mas não mostrava retiradas. Quem abrisse a ficha de um motorista para
// tratar das pendências dele aprovava os documentos e depois tinha de sair,
// ir ao Financeiro e procurar essa pessoa numa lista com as retiradas de toda
// a frota.
//
// POSIÇÃO NA PÁGINA: logo abaixo do cartão de saldo, de propósito. Aprovar uma
// retirada sem olhar o saldo é o erro que a validação do servidor passou a
// bloquear; com os dois juntos, o disponível e o valor pedido ficam à vista ao
// mesmo tempo, em vez de o admin descobrir pelo erro.
//
// A rejeição exige motivo — é a mesma regra do backend, que devolve
// NOTES_REQUIRED sem ele. Validar aqui evita uma ida ao servidor para falhar.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  ArrowDownCircle, CalendarClock, CheckCircle, Clock, Loader2, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { withdrawalsService } from '@/features/driver/services/withdrawals.service';
import { queryKeys } from '@/shared/lib/query-keys';
import type { ApiWithdrawal, WithdrawalStatus } from '@/shared/types/api';

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

// Variantes dark: obrigatórias — as escalas do Tailwind não invertem sozinhas
// e no modo escuro dariam texto escuro sobre fundo claro.
const STATUS_META: Record<
  WithdrawalStatus,
  { label: string; icon: typeof CheckCircle; cls: string }
> = {
  PAID: {
    label: 'Pago',
    icon: CheckCircle,
    cls: 'bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  APPROVED: {
    label: 'Aprovado',
    icon: CheckCircle,
    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  },
  PENDING: {
    label: 'Em análise',
    icon: Clock,
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  REJECTED: {
    label: 'Rejeitado',
    icon: XCircle,
    cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  },
};

function StatusBadge({ status }: { status: WithdrawalStatus }) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}
    >
      <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

interface Props {
  userId: string;
}

export function DriverWithdrawalsCard({ userId }: Props) {
  const queryClient = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<ApiWithdrawal | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.withdrawals.listByUser(userId),
    queryFn: () => withdrawalsService.listByUser(userId),
    enabled: !!userId,
  });

  const withdrawals = data?.withdrawals ?? [];
  const pending = withdrawals.filter((w) => w.status === 'PENDING');
  const pendingTotal = pending.reduce((s, w) => s + Number(w.amount), 0);

  const { mutate: updateStatus, isPending: isUpdating } = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: WithdrawalStatus; notes?: string }) =>
      withdrawalsService.updateStatus(id, { status, notes }),
    onSuccess: (_res, vars) => {
      // O saldo muda com a decisão, por isso é invalidado junto: aprovar move
      // o valor de "pendente" para "sacado" no cálculo do disponível.
      queryClient.invalidateQueries({ queryKey: queryKeys.withdrawals.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.balance.summary(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      toast.success(
        vars.status === 'REJECTED' ? 'Retirada rejeitada.' : 'Retirada aprovada.',
      );
      setRejectTarget(null);
      setRejectReason('');
    },
    onError: (err: any) =>
      toast.error(err?.message ?? 'Não foi possível atualizar a retirada.'),
  });

  function handleReject() {
    const notes = rejectReason.trim();
    if (!notes) {
      toast.error('Indique o motivo da rejeição.');
      return;
    }
    updateStatus({ id: rejectTarget!.id, status: 'REJECTED', notes });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ArrowDownCircle className="h-5 w-5 text-primary" aria-hidden="true" />
                Retiradas
              </CardTitle>
              <CardDescription>
                {pending.length > 0
                  ? `${pending.length} pendente${pending.length !== 1 ? 's' : ''} · ${eur(pendingTotal)}`
                  : `${withdrawals.length} solicitação(ões) no histórico`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              A carregar retiradas…
            </div>
          ) : isError ? (
            <div className="flex flex-col items-start gap-2 py-4">
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar as retiradas.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : withdrawals.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Este motorista ainda não solicitou nenhuma retirada.
            </p>
          ) : (
            <ul>
              {withdrawals.map((w) => {
                const note = w.notes?.trim();
                const isPending = w.status === 'PENDING';
                return (
                  <li key={w.id} className="border-b border-border py-3 last:border-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium tabular-nums">{eur(Number(w.amount))}</p>
                          <StatusBadge status={w.status} />
                        </div>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
                          Pedida em {new Date(w.requestedAt).toLocaleDateString('pt-PT')}
                          {w.processedAt && (
                            <> · decidida em {new Date(w.processedAt).toLocaleDateString('pt-PT')}</>
                          )}
                        </p>
                      </div>

                      {isPending && (
                        <div className="flex shrink-0 gap-2">
                          <Button
                            size="sm"
                            disabled={isUpdating}
                            onClick={() => updateStatus({ id: w.id, status: 'APPROVED' })}
                          >
                            <CheckCircle className="mr-1 h-4 w-4" aria-hidden="true" />
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isUpdating}
                            onClick={() => { setRejectTarget(w); setRejectReason(''); }}
                          >
                            <XCircle className="mr-1 h-4 w-4" aria-hidden="true" />
                            Rejeitar
                          </Button>
                        </div>
                      )}
                    </div>

                    {note && (
                      <p
                        className={`mt-2 rounded-md p-2 text-xs ${
                          w.status === 'REJECTED'
                            ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {w.status === 'REJECTED' && <span className="font-medium">Motivo: </span>}
                        {note}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Rejeição — o backend devolve NOTES_REQUIRED sem motivo */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason(''); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar retirada</DialogTitle>
            <DialogDescription>
              {rejectTarget && `${eur(Number(rejectTarget.amount))} · pedida em ${new Date(rejectTarget.requestedAt).toLocaleDateString('pt-PT')}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="withdrawal-reject-reason">Motivo</Label>
            <Textarea
              id="withdrawal-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explique ao motorista por que a retirada foi recusada."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              O motorista vê este texto no histórico dele e recebe por email.
            </p>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => { setRejectTarget(null); setRejectReason(''); }}
              disabled={isUpdating}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isUpdating || !rejectReason.trim()}
              className="w-full sm:w-auto"
            >
              {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}