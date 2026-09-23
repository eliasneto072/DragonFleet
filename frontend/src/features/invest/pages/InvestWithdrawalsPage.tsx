// src/features/invest/pages/InvestWithdrawalsPage.tsx
//
// Pedir um resgate e ver o estado dos pedidos.
//
// ─── O ECRÃ DIZ O QUE VAI ACONTECER, ANTES DE ACONTECER ─────────────────────
//
// Antes de confirmar, o investidor vê: quanto pode pedir, a partir de que dia
// o dinheiro pode ser pago, e com quanto fica depois. Um pedido que entra e
// desaparece num "pendente" sem prazo nenhum é o que gera o telefonema — e o
// telefonema é para quem gere a empresa, não para quem escreveu o ecrã.
//
// ─── DOIS BOLSOS, DUAS REGRAS ───────────────────────────────────────────────
//
// O rendimento sai de imediato. O capital cumpre o aviso prévio da conta. Estão
// separados no ecrã por isso mesmo, e não por arrumação.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';
import {
  investorsService, type Bucket, type InvestorMe,
} from '@/shared/services/investors.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import { ApiError } from '@/shared/lib/api-client';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Chip, dia } from '../components/invest-bits';

export function InvestWithdrawalsPage() {
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: queryKeys.investors.me, queryFn: () => investorsService.me() });
  const listaQ = useQuery({
    queryKey: queryKeys.investors.withdrawals('me'),
    queryFn: () => investorsService.myWithdrawals(),
  });

  const [bucket, setBucket] = useState<Bucket>('EARNINGS');
  const [valor, setValor] = useState('');
  const [nota, setNota] = useState('');

  const pedir = useMutation({
    mutationFn: () => investorsService.requestWithdrawal({
      bucket,
      amount: Number(valor.replace(',', '.')),
      note: nota.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Pedido enviado. Vai receber uma notificação quando for decidido.');
      setValor('');
      setNota('');
      void qc.invalidateQueries({ queryKey: queryKeys.investors.all });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Não foi possível enviar o pedido.'),
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => investorsService.cancelWithdrawal(id),
    onSuccess: () => {
      toast.success('Pedido retirado.');
      void qc.invalidateQueries({ queryKey: queryKeys.investors.all });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Não foi possível retirar o pedido.'),
  });

  if (meQ.isLoading || !meQ.data) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  const me: InvestorMe = meQ.data;
  const disponivel = bucket === 'CAPITAL'
    ? me.balance.availableCapital
    : me.balance.availableEarnings;
  const reservado = bucket === 'CAPITAL'
    ? me.balance.pendingCapital
    : me.balance.pendingEarnings;

  const pedido = Number(valor.replace(',', '.'));
  const valido = Number.isFinite(pedido) && pedido > 0 && pedido <= disponivel + 0.0001;
  const sobra = valido ? disponivel - pedido : null;

  // A data de pagamento, calculada aqui para o ecrã não ter de esperar pelo
  // servidor para a mostrar. A do servidor é a que vale, e são a mesma conta.
  const prazo = bucket === 'EARNINGS' ? 0 : me.account.noticeDays;
  const dataPagamento = new Date();
  dataPagamento.setDate(dataPagamento.getDate() + prazo);

  return (
    <div className="space-y-6">
      <header className="inv-enter">
        <h1 className="inv-display text-3xl">Resgates</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Peça o levantamento do rendimento ou do capital. Os pedidos são processados
          pela administração.
        </p>
      </header>

      {/* ── O formulário ─────────────────────────────────────────────────── */}
      <section className="inv-surface inv-enter p-6 sm:p-8">
        <p className="inv-label">O que quer levantar</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Opcao
            ativo={bucket === 'EARNINGS'}
            onClick={() => setBucket('EARNINGS')}
            titulo="Rendimento"
            valor={me.balance.availableEarnings}
            nota="Disponível de imediato"
          />
          <Opcao
            ativo={bucket === 'CAPITAL'}
            onClick={() => setBucket('CAPITAL')}
            titulo="Capital"
            valor={me.balance.availableCapital}
            nota={me.account.noticeDays > 0
              ? `Aviso prévio de ${me.account.noticeDays} dias`
              : 'Disponível de imediato'}
          />
        </div>

        <hr className="inv-rule my-7" />

        <label htmlFor="valor" className="inv-label mb-2 block">Valor a resgatar</label>
        <div className="flex gap-3">
          <input
            id="valor"
            type="text"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
            className="inv-field inv-display text-xl"
          />
          <button
            type="button"
            onClick={() => setValor(String(disponivel).replace('.', ','))}
            className="inv-btn-ghost shrink-0 rounded-md px-4 text-xs"
          >
            Tudo
          </button>
        </div>

        {reservado > 0 && (
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            {formatCurrency(reservado)} já estão reservados por pedidos à espera de decisão.
          </p>
        )}

        <label htmlFor="nota" className="inv-label mt-5 mb-2 block">
          Observação <span className="normal-case tracking-normal">(opcional)</span>
        </label>
        <input
          id="nota"
          type="text"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ex.: transferir para o IBAN habitual"
          className="inv-field"
        />

        {/* O resumo do que vai acontecer */}
        {valido && (
          <div className="mt-6 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4 text-sm">
            <Linha
              esquerda="Pagável a partir de"
              direita={prazo === 0 ? 'Assim que for aprovado' : dia(dataPagamento.toISOString())}
            />
            <Linha
              esquerda={`${bucket === 'CAPITAL' ? 'Capital' : 'Rendimento'} depois do resgate`}
              direita={formatCurrency(sobra ?? 0)}
            />
            {bucket === 'CAPITAL' && (
              <p className="mt-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
                Levantar capital reduz o valor sobre o qual o rendimento é calculado
                a partir do dia em que for pago.
              </p>
            )}
          </div>
        )}

        {valor && !valido && (
          <p className="mt-4 text-sm" style={{ color: '#e0a49c' }}>
            {pedido > disponivel
              ? `Só tem ${formatCurrency(disponivel)} disponíveis neste momento.`
              : 'Escreva um valor maior do que zero.'}
          </p>
        )}

        <button
          type="button"
          disabled={!valido || pedir.isPending}
          onClick={() => pedir.mutate()}
          className="inv-btn-gold mt-6 flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm sm:w-auto sm:px-10"
        >
          {pedir.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Pedir resgate
        </button>
      </section>

      {/* ── O histórico ──────────────────────────────────────────────────── */}
      <section className="inv-surface inv-enter p-6 sm:p-7">
        <p className="inv-label">Os seus pedidos</p>

        {listaQ.isLoading ? (
          <Skeleton className="mt-4 h-24 w-full rounded-md" />
        ) : !listaQ.data?.withdrawals.length ? (
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">
            Ainda não fez nenhum pedido.
          </p>
        ) : (
          <div className="mt-4">
            {listaQ.data.withdrawals.map((w) => (
              <div key={w.id} className="inv-row flex flex-wrap items-center justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="inv-display text-lg">{formatCurrency(w.amount)}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {w.bucket === 'CAPITAL' ? 'Capital' : 'Rendimento'} · pedido a {dia(w.createdAt)}
                    {w.status === 'PENDING' && ` · pagável a partir de ${dia(w.availableOn)}`}
                  </p>
                  {w.decision && (
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">{w.decision}</p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Chip estado={w.status} />
                  {w.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={() => cancelar.mutate(w.id)}
                      disabled={cancelar.isPending}
                      className="inv-btn-ghost rounded-md p-1.5"
                      title="Retirar o pedido"
                      aria-label="Retirar o pedido"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Opcao({ ativo, onClick, titulo, valor, nota }: {
  ativo: boolean; onClick: () => void; titulo: string; valor: number; nota: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className="rounded-lg border p-4 text-left transition-colors"
      style={{
        borderColor: ativo ? 'rgba(201,162,39,0.5)' : 'var(--border)',
        background: ativo ? 'rgba(201,162,39,0.08)' : 'transparent',
      }}
    >
      <p className="text-sm font-medium">{titulo}</p>
      <p className="inv-display mt-1 text-2xl" style={ativo ? { color: 'var(--gold-200)' } : undefined}>
        {formatCurrency(valor)}
      </p>
      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">{nota}</p>
    </button>
  );
}

function Linha({ esquerda, direita }: { esquerda: string; direita: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-[var(--muted-foreground)]">{esquerda}</span>
      <span className="inv-display">{direita}</span>
    </div>
  );
}
