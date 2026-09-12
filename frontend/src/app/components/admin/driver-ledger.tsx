// src/app/components/admin/driver-ledger.tsx
//
// O extrato de um motorista: os movimentos por ordem, e com quanto ele ficou
// depois de cada um.
//
// Pedido do cliente: "filtrar por motorista, e aparecer não só o movimento, mas
// também aparecer com quanto é que ele ficou depois daquele movimento".
//
// ─── A COLUNA NÃO SE PODE CHAMAR "SALDO" ─────────────────────────────────────
//
// O extrato desconta as retiradas pagas e aprovadas, e não as pendentes. Isso
// faz com que a última linha seja o disponível MAIS o que está reservado por
// pedidos por decidir.
//
// O portal do motorista mostra "Saldo disponível para retirada" — um número
// menor. Se esta tela disser "Saldo" e mostrar outro valor, a administração e o
// motorista passam a ter dois números para a mesma conta, e a conversa é sobre
// o dinheiro dele.
//
// Daí duas coisas: a coluna chama-se "Saldo em conta", e a linha de
// reconciliação por cima mostra os três números com a conta feita à vista. Não
// é decoração — é o que impede o telefonema.

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/app/components/ui/card';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/app/components/ui/table';
import { AlertCircle, ArrowDownRight, ArrowUpRight, Info, Minus, Plus } from 'lucide-react';
import { balanceService, type LedgerEntry, type LedgerKind } from '@/features/admin/services/balance.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';

interface DriverLedgerProps {
  userId: string;
  driverName: string;
}

const ICONE: Record<LedgerKind, typeof Plus> = {
  SETTLEMENT: ArrowUpRight,
  CREDIT: Plus,
  DEBIT: Minus,
  WITHDRAWAL: ArrowDownRight,
};

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function Linha({ entrada }: { entrada: LedgerEntry }) {
  const Icone = ICONE[entrada.kind];
  const entra = entrada.amount >= 0;

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
        {dataCurta(entrada.date)}
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-2">
          <Icone
            className={`h-4 w-4 shrink-0 ${entra ? 'text-success' : 'text-destructive'}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="font-medium">{entrada.label}</p>
            {entrada.detail && (
              <p className="truncate text-xs text-muted-foreground">{entrada.detail}</p>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell className={`text-right tabular-nums ${entra ? 'text-success' : 'text-destructive'}`}>
        {entra ? '+' : '−'}{formatCurrency(Math.abs(entrada.amount))}
      </TableCell>

      {/* A coluna que o cliente pediu. Em negrito porque é a resposta à
          pergunta; o valor do movimento é só o caminho até ela. */}
      <TableCell className="text-right font-semibold tabular-nums">
        {formatCurrency(entrada.balance)}
      </TableCell>
    </TableRow>
  );
}

export function DriverLedger({ userId, driverName }: DriverLedgerProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.balance.ledger(userId),
    queryFn: () => balanceService.getLedger(userId),
  });

  if (isLoading) {
    return (
      <Card className="shadow-card">
        <CardContent className="space-y-3 p-4 sm:p-6">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="shadow-card border-destructive/40">
        <CardContent className="flex gap-3 p-4">
          <AlertCircle className="h-[18px] w-[18px] shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-sm">
            {(error as any)?.message ?? 'Não foi possível carregar o extrato.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { entries, reconciliation } = data!;

  if (entries.length === 0) {
    return (
      <Card className="shadow-card">
        <CardContent className="p-6 text-center">
          <p className="font-medium">Sem movimentos registados.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {driverName} ainda não tem fechos registados, ajustes nem retiradas
            decididas. Um fecho em rascunho não conta — só credita quando é
            registado.
          </p>
        </CardContent>
      </Card>
    );
  }

  const temPendentes = reconciliation.pendingWithdrawals > 0;

  return (
    <div className="space-y-4">
      {/* ─── A LINHA DE RECONCILIAÇÃO ───────────────────────────────────────
          Os três números juntos, com a conta à vista. É o que impede que a
          administração e o motorista tenham dois valores para a mesma conta. */}
      <Card className="shadow-card">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Saldo em conta
              </p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                {formatCurrency(reconciliation.accountBalance)}
              </p>
            </div>

            {temPendentes && (
              <>
                <div className="text-muted-foreground sm:pb-1.5">−</div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Retiradas em análise
                  </p>
                  <p className="mt-0.5 text-lg tabular-nums text-muted-foreground">
                    {formatCurrency(reconciliation.pendingWithdrawals)}
                  </p>
                </div>
                <div className="text-muted-foreground sm:pb-1.5">=</div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Disponível para retirada
                  </p>
                  <p className="mt-0.5 text-lg font-medium tabular-nums">
                    {formatCurrency(reconciliation.availableToWithdraw)}
                  </p>
                </div>
              </>
            )}
          </div>

          {temPendentes && (
            <p className="mt-3 text-xs text-muted-foreground">
              O motorista vê <strong>{formatCurrency(reconciliation.availableToWithdraw)}</strong>{' '}
              no portal dele, porque os pedidos por decidir ficam reservados. Não
              aparecem no extrato abaixo — uma retirada pendente ainda pode ser
              recusada.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Data</TableHead>
                  <TableHead>Movimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Saldo em conta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => <Linha key={e.id} entrada={e} />)}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 rounded-lg border border-border bg-muted/40 p-4">
        <Info className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            As retiradas assentam na data do <strong>pedido</strong>, não na da
            decisão. É a data que o motorista vê na tela dele, e é a única que
            não muda quando um pedido passa de aprovado a pago.
          </p>
          <p>
            Os fechos assentam na <strong>semana a que dizem respeito</strong>, e
            não na data em que foram lançados. Um fecho lançado com atraso aparece
            na semana dele.
          </p>
        </div>
      </div>
    </div>
  );
}
