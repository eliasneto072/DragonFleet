// src/app/components/admin/bank-approvals.tsx
//
// Aprovação de dados bancários, no Financeiro.
//
// POR QUE AQUI E NÃO EM DOCUMENTOS: é ao lado de onde o dinheiro sai. Quem
// aprova um IBAN é a mesma pessoa que a seguir o copia para o banco, e o
// Financeiro é a tela onde ela já está. A tela de Documentos trata da
// habilitação do motorista, que é outra tarefa e outro momento.
//
// POR QUE A APROVAÇÃO EXISTE: trocar o IBAN é o vetor clássico de fraude —
// quem ganhe acesso à conta muda o número e desvia o pagamento seguinte, sem
// tocar em mais nada. Validar o comprovativo antes de o novo IBAN passar a
// valer fecha essa porta. É por isso que o comprovativo é mostrado aqui e não
// é opcional abri-lo.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  AlertCircle, CheckCircle, ExternalLink, Landmark, Loader2, Search, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { CopyIbanButton } from '@/app/components/ui/copy-iban-button';
import { bankService } from '@/shared/services/bank.service';
import { formatIban } from '@/shared/lib/iban';
import { queryKeys } from '@/shared/lib/query-keys';
import { invalidateAfterBank } from '@/shared/lib/invalidate';
import type { ApiPendingBankAccount } from '@/shared/types/api';
import { useListState } from '@/shared/hooks/use-list-state';
import { Pagination } from '@/app/components/ui/list-toolbar';
import { Input } from '@/app/components/ui/input';

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ApprovalsSkeleton() {
  return (
    <Card className="shadow-card" role="status" aria-busy="true">
      <span className="sr-only">A carregar os dados bancários por aprovar…</span>
      <CardHeader className="p-4 sm:p-6"><Skeleton className="h-5 w-56" /></CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2 border-b border-border pb-4 last:border-0">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export function BankApprovals() {
  const queryClient = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<ApiPendingBankAccount | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Pesquisa e página no endereço, como nas outras listagens.
  const lista = useListState({ defaults: {} });

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: [...queryKeys.bank.pending, lista.search, lista.page] as const,
    queryFn: () => bankService.listPending({
      search: lista.search || undefined,
      page: lista.page,
      pageSize: 20,
    }),
    placeholderData: (anterior) => anterior,
  });

  const accounts = data?.accounts ?? [];
  const pageInfo = data?.page;

  const { mutate: review, isPending: reviewing } = useMutation({
    mutationFn: ({ userId, approve, reason }: {
      userId: string; approve: boolean; reason?: string;
    }) => bankService.review(userId, { approve, reason }),
    onSuccess: (_r, vars) => {
      // Além da fila: aprovar destranca os pedidos de retirada do motorista.
      invalidateAfterBank(queryClient);
      toast.success(vars.approve ? 'Dados bancários aprovados.' : 'Alteração recusada.');
      setRejectTarget(null);
      setRejectReason('');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível decidir.'),
  });

  if (isLoading) return <ApprovalsSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <p className="text-muted-foreground">Erro ao carregar os dados bancários.</p>
        <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Landmark className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
            Dados bancários por aprovar
          </CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Quem espera há mais tempo aparece primeiro
          </p>
        </CardHeader>

        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          {/* Pesquisa: com centenas à espera, encontrar um motorista específico
              obrigava a percorrer a lista com os olhos — numa tela onde se
              chega já a saber de quem se anda à procura. */}
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Procurar por nome ou email…"
              className="pl-9"
              value={lista.searchInput}
              onChange={(e) => lista.setSearchInput(e.target.value)}
              aria-label="Procurar motoristas com IBAN por aprovar"
            />
          </div>

          {pageInfo && pageInfo.totalPages > 1 && (
            <Pagination
              info={pageInfo} onChange={lista.setPage} busy={isFetching} compact
            />
          )}

          {accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle className="h-8 w-8 text-success" aria-hidden="true" />
              <p className="text-sm font-medium">
                {lista.search ? `Nada encontrado para “${lista.search}”` : 'Nada por aprovar'}
              </p>
              <p className="text-sm text-muted-foreground">
                {lista.search
                  ? 'Verifique a escrita ou limpe a pesquisa.'
                  : 'Todas as alterações de dados bancários foram decididas.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-5">
              {accounts.map((a) => (
                <li key={a.userId} className="border-b border-border pb-5 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.user.email}</p>
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">
                      Submetido a {formatDateTime(a.pendingAt)}
                    </p>
                  </div>

                  {/* O em vigor aparece ao lado do submetido quando existe:
                      sem a comparação, quem decide não vê que está a substituir
                      um IBAN válido nem por qual. */}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {a.iban && (
                      <div className="rounded-lg border border-border bg-secondary p-3">
                        <p className="text-xs font-medium text-muted-foreground">IBAN em vigor</p>
                        <p className="mt-1 break-all font-mono text-sm tabular-nums">
                          {formatIban(a.iban)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {a.holderName ?? '—'}
                        </p>
                      </div>
                    )}

                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                      <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                        {a.iban ? 'IBAN submetido' : 'IBAN submetido (primeiro registo)'}
                      </p>
                      <p className="mt-1 break-all font-mono text-sm tabular-nums">
                        {formatIban(a.pendingIban)}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {a.pendingHolderName ?? '—'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {a.proofUrl ? (
                      <Button asChild variant="outline" size="sm" className="h-8">
                        <a href={a.proofUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          Ver comprovativo
                        </a>
                      </Button>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        Sem comprovativo — recuse e peça novo envio
                      </span>
                    )}

                    {a.pendingIban && <CopyIbanButton iban={a.pendingIban} />}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm" className="h-8" disabled={reviewing}
                      onClick={() => review({ userId: a.userId, approve: true })}
                    >
                      <CheckCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      Aprovar
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-8" disabled={reviewing}
                      onClick={() => { setRejectTarget(a); setRejectReason(''); }}
                    >
                      <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      Recusar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {pageInfo && (
            <Pagination info={pageInfo} onChange={lista.setPage} busy={isFetching} />
          )}
        </CardContent>
      </Card>

      {/* Recusa — o backend devolve NOTES_REQUIRED sem motivo. */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason(''); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar dados bancários</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  {rejectTarget.user.name} — {formatIban(rejectTarget.pendingIban)}.
                  {rejectTarget.iban && ' O IBAN em vigor continua intacto.'}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="bank-reject-reason">Motivo</Label>
            <Textarea
              id="bank-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explique o que está errado — o comprovativo não bate com o IBAN, o nome do titular não corresponde…"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              O motorista vê este texto no Perfil e recebe uma notificação.
            </p>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline" disabled={reviewing} className="w-full sm:w-auto"
              onClick={() => { setRejectTarget(null); setRejectReason(''); }}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={reviewing || !rejectReason.trim()}
              className="w-full sm:w-auto"
              onClick={() => review({
                userId: rejectTarget!.userId,
                approve: false,
                reason: rejectReason.trim(),
              })}
            >
              {reviewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
