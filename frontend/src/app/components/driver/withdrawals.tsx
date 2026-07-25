// src/app/components/driver/withdrawals.tsx
//
// Tela de retiradas do motorista.
//
// Notas de manutenção:
// - O hero é azul, distinto do verde do dashboard, para separar as duas telas
//   à primeira vista. A ilustração acompanha via tone="info".
// - O hero é um flex de duas colunas em todos os tamanhos; a ilustração encolhe
//   no telemóvel em vez de desaparecer.
// - O gradiente é fixo e não acompanha o modo escuro, então todo texto dentro
//   dele usa branco com opacidade em vez de tokens de tema.
// - shadow-brand tem tinta verde (rgba(16,136,101,…)); num hero azul isso
//   produziria um halo esverdeado. Este hero usa shadow-md.
// - Todo valor monetário passa por formatCurrency(). Ver o comentário no topo
//   de shared/lib/format.ts.

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/app/components/ui/dialog';
import {
  CheckCircle, Clock, XCircle, ArrowDownToLine, Loader2, AlertCircle, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { withdrawalsService } from '@/features/driver/services/withdrawals.service';
import { formatCurrency } from '@/shared/lib/format';
import { queryKeys } from '@/shared/lib/query-keys';
import { FINANCIAL } from '@/shared/constants';
import { PayoutIllustration } from '@/app/components/ui/payout-illustration';
import type { ApiWithdrawal, WithdrawalStatus } from '@/shared/types/api';

// Ponto único de verdade para o status de uma retirada.
//
// As variantes dark: são obrigatórias: bg-*-100 com text-*-800 não invertem
// sozinhas e no modo escuro dariam texto escuro sobre fundo claro. O estado
// PAID usa a escala emerald no escuro em vez de brand-50/brand-700 porque, na
// rampa invertida, brand-50 e brand-700 ficam ambos escuros e o contraste cai
// abaixo do mínimo legível.
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

function WithdrawalsSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" role="status" aria-busy="true">
      <span className="sr-only">A carregar as retiradas…</span>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-4 w-52" />
          </div>
        </div>
        <Skeleton className="h-9 w-full sm:w-36 sm:shrink-0" />
      </div>

      <Skeleton className="h-40 w-full rounded-xl" />

      <Card className="shadow-card">
        <CardHeader className="space-y-2 p-4 sm:p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start justify-between gap-3 border-b pb-3 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <div className="space-y-1.5 text-right">
                <Skeleton className="ml-auto h-4 w-20" />
                <Skeleton className="ml-auto h-3 w-12" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function Withdrawals() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  // O botão "Retirar" do hero do dashboard navega para cá com
  // state.openNew = true, já abrindo o diálogo.
  const [open, setOpen] = useState(
    () => Boolean((location.state as { openNew?: boolean } | null)?.openNew),
  );
  const [amount, setAmount] = useState('');

  // Limpa o state para que um refresh (ou voltar no histórico) não reabra
  // o diálogo sozinho.
  useEffect(() => {
    if ((location.state as { openNew?: boolean } | null)?.openNew) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.withdrawals.list,
    queryFn: () => withdrawalsService.list(),
  });

  const withdrawals: ApiWithdrawal[] = data?.withdrawals ?? [];

  const settled = withdrawals.filter((w) => w.status === 'PAID' || w.status === 'APPROVED');
  const totalWithdrawn = settled.reduce((sum, w) => sum + Number(w.amount), 0);

  const { mutate: createWithdrawal, isPending } = useMutation({
    mutationFn: (value: number) => withdrawalsService.create(value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.withdrawals.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.balance.all });
      toast.success('Solicitação de saque enviada!');
      setOpen(false);
      setAmount('');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao solicitar saque.'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(amount);
    if (isNaN(value) || value < FINANCIAL.minWithdrawal) {
      toast.error(`Valor mínimo: ${formatCurrency(FINANCIAL.minWithdrawal)}`);
      return;
    }
    if (value > FINANCIAL.maxWithdrawal) {
      toast.error(`Valor máximo: ${formatCurrency(FINANCIAL.maxWithdrawal)}`);
      return;
    }
    createWithdrawal(value);
  }

  if (isLoading) return <WithdrawalsSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Erro ao carregar saques.</p>
        <Button
          variant="outline"
          onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.withdrawals.all })}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Retiradas"
        subtitle="Solicite saques e acompanhe seu histórico"
        icon={<ArrowDownToLine className="h-5 w-5" />}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <ArrowDownToLine className="mr-2 h-4 w-4" />Nova Retirada
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Solicitar Retirada</DialogTitle>
                <DialogDescription>
                  Mínimo {formatCurrency(FINANCIAL.minWithdrawal)} · Máximo{' '}
                  {formatCurrency(FINANCIAL.maxWithdrawal)}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Valor da retirada</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">€</span>
                    <Input
                      id="amount" type="number" step="0.01"
                      min={FINANCIAL.minWithdrawal} max={FINANCIAL.maxWithdrawal}
                      placeholder="0,00" className="pl-8"
                      value={amount} onChange={(e) => setAmount(e.target.value)} required
                    />
                  </div>
                </div>

                <div className="flex gap-2 rounded-lg border border-border bg-secondary p-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    Saques são processados em até {FINANCIAL.processingDays} dias úteis.
                  </p>
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button" variant="outline" onClick={() => setOpen(false)}
                    className="w-full sm:w-auto"
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Solicitar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Hero: total sacado */}
      <div
        className="overflow-hidden rounded-xl p-5 shadow-md sm:p-6"
        style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}
      >
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/70">Total sacado</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-white tabular-nums sm:text-4xl">
              {formatCurrency(totalWithdrawn)}
            </p>
            <p className="mt-2 text-sm text-white/70">
              {settled.length} saque{settled.length !== 1 ? 's' : ''} aprovado
              {settled.length !== 1 ? 's' : ''} ou pago{settled.length !== 1 ? 's' : ''}
            </p>
          </div>

          <PayoutIllustration
            tone="info"
            surface="dark"
            className="h-20 w-auto shrink-0 sm:h-32 lg:h-36"
          />
        </div>
      </div>

      {/* Histórico */}
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Histórico de retiradas</CardTitle>
          <CardDescription>Acompanhe todas as suas solicitações</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {withdrawals.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum saque solicitado ainda.
            </p>
          ) : (
            <ul className="space-y-3">
              {withdrawals.map((w) => {
                const note = w.notes?.trim();
                return (
                  <li key={w.id} className="border-b pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <p className="font-medium tabular-nums">
                          {formatCurrency(Number(w.amount))}
                        </p>
                        <StatusBadge status={w.status} />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium tabular-nums">
                          {new Date(w.requestedAt).toLocaleDateString('pt-PT')}
                        </p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {new Date(w.requestedAt).toLocaleTimeString('pt-PT', {
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>

                    {/* Motivo da recusa em destaque — mesmo padrão dos documentos.
                        Para os demais status a nota é informativa. */}
                    {note && (
                      w.status === 'REJECTED' ? (
                        <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                          <span className="font-medium">Motivo:</span> {note}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
