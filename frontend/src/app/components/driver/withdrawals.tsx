// src/app/components/driver/withdrawals.tsx
//
// Tela de retiradas do motorista.
//
// O QUE MUDOU E PORQUÊ: o pedido passou a exigir duas coisas que a tela não
// conhecia — um recibo verde anexado e um IBAN aprovado. Enquanto isso não
// existiu aqui, o serviço enviava JSON contra uma rota que espera multipart e
// TODOS os pedidos levavam 400. Nenhum motorista conseguia pedir uma retirada.
//
// A TRANCA É À ENTRADA. Sem IBAN aprovado o botão nasce desativado, com o
// motivo à vista e um atalho para o Perfil. Deixar preencher o valor, anexar o
// recibo e só depois recusar com BANK_ACCOUNT_REQUIRED é a pior versão disto:
// o trabalho todo perdido e o comprovativo enviado para nada.
//
// O SALDO DISPONÍVEL passou a aparecer. Antes o motorista escolhia o valor às
// cegas e levava INSUFFICIENT_BALANCE; e como o backend verifica o saldo ANTES
// do IBAN, quem pedisse a mais nem chegava a saber que faltava outra coisa.
//
// Notas de manutenção herdadas:
// - O hero é azul, distinto do verde do painel, para separar as duas telas à
//   primeira vista. A ilustração acompanha via tone="info".
// - O gradiente é fixo e não acompanha o modo escuro, por isso todo o texto lá
//   dentro usa branco com opacidade em vez de tokens de tema.
// - shadow-brand tem tinta verde; num hero azul daria um halo esverdeado. Este
//   usa shadow-md.
// - Todo o valor monetário passa por formatCurrency(). Ver shared/lib/format.ts.

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageHeader } from '@/app/components/ui/page-header';
import { FilePicker } from '@/app/components/ui/file-picker';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  CheckCircle, Clock, XCircle, ArrowDownToLine, Loader2, AlertCircle, Info,
  Landmark, Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/context/AuthContext';
import { withdrawalsService } from '@/features/driver/services/withdrawals.service';
import { bankService } from '@/shared/services/bank.service';
import { balanceService } from '@/features/admin/services/balance.service';
import { formatCurrency } from '@/shared/lib/format';
import { formatIban } from '@/shared/lib/iban';
import { queryKeys } from '@/shared/lib/query-keys';
import { invalidateAfterWithdrawal } from '@/shared/lib/invalidate';
// Os limites vêm do servidor, não de constantes: as cravadas diziam 10.000 de
// máximo enquanto o sistema aplicava 5.000, e a tela prometia ao motorista o
// que seria recusado.
import { useSettings } from '@/shared/hooks/use-settings';
import { PayoutIllustration } from '@/app/components/ui/payout-illustration';
import type { ApiWithdrawal, WithdrawalStatus } from '@/shared/types/api';

// Ponto único de verdade para o estado de uma retirada.
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
  const { user } = useAuth();

  const { minWithdrawal, maxWithdrawal, processingDays } = useSettings();

  // O botão "Retirar" do hero do painel navega para cá com state.openNew,
  // já abrindo o diálogo.
  const [open, setOpen] = useState(
    () => Boolean((location.state as { openNew?: boolean } | null)?.openNew),
  );
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState('');

  // Limpa o state para que um refresh, ou voltar no histórico, não reabra o
  // diálogo sozinho.
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

  // A mesma pergunta responde a duas coisas: se pode pedir, e para onde vai.
  const bankQuery = useQuery({
    queryKey: queryKeys.bank.mine,
    queryFn: () => bankService.getMine(),
  });

  const balanceQuery = useQuery({
    queryKey: queryKeys.balance.summary(user?.id ?? ''),
    queryFn: () => balanceService.getSummary(user!.id),
    enabled: !!user?.id,
  });

  const withdrawals: ApiWithdrawal[] = data?.withdrawals ?? [];
  const account = bankQuery.data?.account;
  const available = balanceQuery.data?.balance.available ?? 0;

  // isUsable é derivado no servidor: há IBAN em vigor. Enquanto a consulta não
  // responde tratamos como bloqueado — abrir o formulário para o fechar a
  // seguir seria pior do que esperar.
  const canWithdraw = account?.isUsable === true;

  const settled = withdrawals.filter((w) => w.status === 'PAID' || w.status === 'APPROVED');
  const totalWithdrawn = settled.reduce((sum, w) => sum + Number(w.amount), 0);

  const { mutate: createWithdrawal, isPending } = useMutation({
    mutationFn: ({ value, file }: { value: number; file: File }) =>
      withdrawalsService.create(value, file),
    onSuccess: () => {
      // Também o painel do administrador: o pedido entra na fila dele.
      invalidateAfterWithdrawal(queryClient);
      toast.success('Pedido de retirada enviado.');
      setOpen(false);
      setAmount('');
      setReceipt(null);
      setReceiptError('');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao pedir a retirada.'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(amount);

    if (isNaN(value) || value < minWithdrawal) {
      toast.error(`Valor mínimo: ${formatCurrency(minWithdrawal)}`);
      return;
    }
    if (value > maxWithdrawal) {
      toast.error(`Valor máximo: ${formatCurrency(maxWithdrawal)}`);
      return;
    }
    // O servidor verifica o saldo antes do IBAN e devolve INSUFFICIENT_BALANCE;
    // dizê-lo aqui evita a viagem e o recibo enviado para nada.
    if (value > available) {
      toast.error(`Disponível para retirada: ${formatCurrency(available)}`);
      return;
    }
    if (!receipt) {
      setReceiptError('Anexe o recibo verde.');
      return;
    }

    createWithdrawal({ value, file: receipt });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setReceipt(null);
      setReceiptError('');
    }
  }

  if (isLoading) return <WithdrawalsSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <p className="text-muted-foreground">Erro ao carregar as retiradas.</p>
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
        subtitle="Peça retiradas e acompanhe o seu histórico"
        icon={<ArrowDownToLine className="h-5 w-5" />}
        actions={
          <Button
            className="w-full sm:w-auto"
            disabled={!canWithdraw || bankQuery.isLoading}
            onClick={() => setOpen(true)}
          >
            <ArrowDownToLine className="mr-2 h-4 w-4" aria-hidden="true" />
            Nova Retirada
          </Button>
        }
      />

      {/* Sem IBAN aprovado: o motivo e o caminho, em vez de um botão morto sem
          explicação. Cobre os três casos em que não se pode pedir — nunca
          registou, está à espera de decisão, e foi recusado. */}
      {!bankQuery.isLoading && !canWithdraw && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40 sm:p-5">
          <div className="flex items-start gap-3">
            <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {account?.hasPending
                  ? 'Os seus dados bancários aguardam aprovação'
                  : account?.rejectionReason
                    ? 'Os seus dados bancários foram recusados'
                    : 'Ainda não registou uma conta bancária'}
              </p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                {account?.hasPending
                  ? 'Assim que a administração aprovar, poderá pedir retiradas.'
                  : 'Sem IBAN aprovado não há destino para a transferência, por isso os pedidos ficam bloqueados.'}
              </p>
              {account?.rejectionReason && !account.hasPending && (
                <p className="mt-1.5 text-sm text-amber-800 dark:text-amber-300">
                  <span className="font-medium">Motivo:</span> {account.rejectionReason}
                </p>
              )}
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to="/app/driver/profile">Ir para o Perfil</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hero: disponível e total já retirado.
          O disponível vem primeiro porque é o número que decide o pedido. */}
      <div
        className="overflow-hidden rounded-xl p-5 shadow-md sm:p-6"
        style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}
      >
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/70">Disponível para retirada</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-white tabular-nums sm:text-4xl">
              {balanceQuery.isLoading ? '—' : formatCurrency(available)}
            </p>
            <p className="mt-2 text-sm text-white/70">
              {formatCurrency(totalWithdrawn)} já retirados em {settled.length} pedido
              {settled.length !== 1 ? 's' : ''}
            </p>
            {account?.isUsable && account.iban && (
              <p className="mt-2 truncate font-mono text-xs text-white/60">
                {formatIban(account.iban)}
              </p>
            )}
          </div>

          <PayoutIllustration
            tone="info"
            surface="dark"
            className="h-20 w-auto shrink-0 sm:h-32 lg:h-36"
          />
        </div>
      </div>

      {/* O diálogo vive fora do PageHeader porque também é aberto pelo
          state.openNew vindo do painel, e não só pelo botão. */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedir retirada</DialogTitle>
            <DialogDescription>
              Disponível {formatCurrency(available)} · mínimo {formatCurrency(minWithdrawal)} ·
              máximo {formatCurrency(maxWithdrawal)}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="mt-4 min-w-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Valor da retirada</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground">€</span>
                <Input
                  id="amount" type="number" step="0.01"
                  min={minWithdrawal} max={maxWithdrawal}
                  placeholder="0,00" className="pl-8"
                  value={amount} onChange={(e) => setAmount(e.target.value)} required
                />
              </div>
              <button
                type="button"
                onClick={() => setAmount(String(available))}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Usar o disponível ({formatCurrency(available)})
              </button>
            </div>

            <FilePicker
              id="withdrawal-receipt"
              label="Recibo verde"
              hint="JPEG, PNG, WebP ou PDF — máx. 10 MB"
              file={receipt}
              onChange={(f) => { setReceipt(f); if (f) setReceiptError(''); }}
              error={receiptError}
              onError={setReceiptError}
              disabled={isPending}
            />

            <div className="flex gap-2 rounded-lg border border-border bg-secondary p-3">
              <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                O recibo é obrigatório: a empresa não transfere sem fatura.
              </p>
            </div>

            {account?.iban && (
              <div className="flex gap-2 rounded-lg border border-border bg-secondary p-3">
                <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">Transferência para</p>
                  <p className="break-all font-mono text-xs">{formatIban(account.iban)}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2 rounded-lg border border-border bg-secondary p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                As retiradas são processadas em até {processingDays} dias úteis.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button" variant="outline" onClick={() => handleOpenChange(false)}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Pedir
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Histórico */}
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Histórico de retiradas</CardTitle>
          <CardDescription>Acompanhe todos os seus pedidos</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {withdrawals.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Ainda não pediu nenhuma retirada.
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

                    {/* O IBAN só existe depois da aprovação, e é o que ficou
                        congelado — não o atual. Mostrá-lo responde a "para onde
                        foi este dinheiro?" mesmo depois de o motorista mudar
                        de conta. */}
                    {w.paidToIban && (
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {formatIban(w.paidToIban)}
                      </p>
                    )}

                    {/* Motivo da recusa em destaque — mesmo padrão dos
                        documentos. Nos outros estados a nota é informativa. */}
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
