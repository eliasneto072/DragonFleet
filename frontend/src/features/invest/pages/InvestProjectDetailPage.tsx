// src/features/invest/pages/InvestProjectDetailPage.tsx
//
// Um projeto visto pelo investidor: o que é, quanto rendeu mês a mês, e a
// subscrição.
//
// ─── O HISTÓRICO MENSAL É O ARGUMENTO DE VENDA ──────────────────────────────
//
// Um projeto a render mostra cada mês com o lucro apurado e a fatia dos
// investidores. Não é enfeite: é a única forma de alguém decidir se quer
// entrar no projeto seguinte. Uma promessa de rentabilidade sem meses
// anteriores à vista vale o que vale.
//
// ─── A SUBSCRIÇÃO DIZ O QUE VAI ACONTECER ───────────────────────────────────
//
// Antes de confirmar, o investidor vê a percentagem do projeto que fica a ser
// dele e uma estimativa do que isso teria dado no último mês apurado. Estimado
// e escrito como tal — o mês que vem pode ser outro.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Car, Loader2 } from 'lucide-react';
import {
  projectsService, ESTADO_DO_PROJETO,
} from '@/shared/services/projects.service';
import { investorsService } from '@/shared/services/investors.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import { ApiError } from '@/shared/lib/api-client';
import { Skeleton } from '@/app/components/ui/skeleton';
import { mesLegivel } from '../components/invest-bits';

export function InvestProjectDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [valor, setValor] = useState('');

  const q = useQuery({
    queryKey: queryKeys.projects.detail(id),
    queryFn: () => projectsService.get(id),
    enabled: !!id,
  });
  const meQ = useQuery({
    queryKey: queryKeys.investors.me,
    queryFn: () => investorsService.me(),
  });

  const subscrever = useMutation({
    mutationFn: () => projectsService.subscribe(id, Number(valor.replace(',', '.'))),
    onSuccess: () => {
      toast.success('Subscrição registada.');
      setValor('');
      void qc.invalidateQueries({ queryKey: queryKeys.projects.all });
      void qc.invalidateQueries({ queryKey: queryKeys.investors.all });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Não foi possível subscrever.'),
  });

  if (q.isLoading || !q.data) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  const { project: p, periods, mine } = q.data;
  const disponivel = meQ.data?.balance.availableCapital ?? 0;

  const falta = Math.max(0, p.targetAmount - p.raised);
  const pct = p.targetAmount > 0 ? Math.min(100, (p.raised / p.targetAmount) * 100) : 0;

  const pedido = Number(valor.replace(',', '.'));
  const valido = Number.isFinite(pedido) && pedido > 0
    && pedido <= disponivel + 0.0001
    && pedido <= falta + 0.0001
    && (p.minTicket === 0 || pedido >= p.minTicket);

  // A fatia do projeto que esta subscrição lhe daria, se ele confirmar.
  const futuraQuota = valido && p.raised + pedido > 0
    ? ((mine?.amount ?? 0) + pedido) / (p.raised + pedido)
    : 0;

  const ultimoPago = periods.find((x) => x.status === 'DISTRIBUTED');

  return (
    <div className="space-y-6">
      <Link
        to="/projetos"
        className="inv-enter inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Projetos
      </Link>

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <section className="inv-surface-gold inv-enter p-7 sm:p-9">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="inv-label">{ESTADO_DO_PROJETO[p.status]}</p>
            <h1 className="inv-display mt-2 text-4xl">{p.name}</h1>
            <p className="mt-2 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
              <Car className="h-3.5 w-3.5" aria-hidden="true" />
              {p.vehicle
                ? `${p.vehicle.brand} ${p.vehicle.model} · ${p.vehicle.plate}`
                : 'Carro por atribuir'}
            </p>
          </div>
          {p.riskLevel && (
            <span className="inv-chip inv-chip-gold">Risco {p.riskLevel}</span>
          )}
        </div>

        {p.description && (
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            {p.description}
          </p>
        )}

        <div className="mt-7 grid gap-5 sm:grid-cols-3">
          <Dado titulo="Meta" valor={formatCurrency(p.targetAmount)} />
          <Dado titulo="Já angariado" valor={formatCurrency(p.raised)} destaque />
          <Dado titulo="Para os investidores" valor={`${p.profitShare}% do lucro`} />
        </div>

        {p.status === 'FUNDING' && (
          <div className="mt-6">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: 'rgba(255,255,255,0.12)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, pct)}%`,
                  background: 'linear-gradient(90deg, #8c6f18, #e0c98a)',
                }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              {falta > 0 ? `Faltam ${formatCurrency(falta)}` : 'Totalmente financiado'}
              {' · '}{p.investorsCount} investidor{p.investorsCount === 1 ? '' : 'es'}
            </p>
          </div>
        )}
      </section>

      {/* ── A minha posição ──────────────────────────────────────────────── */}
      {mine && (mine.amount > 0 || mine.received > 0 || mine.liquidated > 0) && (
        <section className="inv-surface inv-enter p-6 sm:p-7">
          <p className="inv-label">A sua posição</p>
          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            <Dado titulo="Aplicado" valor={formatCurrency(mine.amount)} />
            <Dado
              titulo="Quota do projeto"
              valor={`${(mine.ratio * 100).toFixed(1).replace('.', ',')}%`}
            />
            <Dado titulo="Já recebido" valor={formatCurrency(mine.received)} destaque />
          </div>
          {mine.liquidated > 0 && (
            <p className="mt-4 text-xs text-[var(--muted-foreground)]">
              Liquidado por {formatCurrency(mine.liquidated)} — já no seu saldo disponível.
            </p>
          )}
        </section>
      )}

      {/* ── Subscrever ───────────────────────────────────────────────────── */}
      {p.status === 'FUNDING' && falta > 0 && (
        <section className="inv-surface inv-enter p-6 sm:p-8">
          <p className="inv-label">Participar neste projeto</p>

          <div className="mt-4 flex gap-3">
            <input
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className="inv-field inv-display text-xl"
              aria-label="Valor a aplicar"
            />
            <button
              type="button"
              onClick={() => setValor(String(Math.min(disponivel, falta)).replace('.', ','))}
              className="inv-btn-ghost shrink-0 rounded-md px-4 text-xs"
            >
              Máximo
            </button>
          </div>

          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Tem {formatCurrency(disponivel)} de capital disponível
            {p.minTicket > 0 && ` · mínimo ${formatCurrency(p.minTicket)} neste projeto`}
          </p>

          {valido && (
            <div className="mt-5 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4 text-sm">
              <Linha
                esquerda="Ficaria com"
                direita={`${(futuraQuota * 100).toFixed(1).replace('.', ',')}% do projeto`}
              />
              {ultimoPago && (
                <Linha
                  esquerda={`Isso em ${mesLegivel(ultimoPago.month)} teria dado`}
                  direita={formatCurrency(ultimoPago.investorsAmount * futuraQuota)}
                />
              )}
              <p className="mt-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
                Estimativa sobre um mês passado — o rendimento de cada mês depende do que o
                carro fizer. O capital fica aplicado até o carro ser vendido e não é
                abatido pelas distribuições.
              </p>
            </div>
          )}

          {valor && !valido && (
            <p className="mt-4 text-sm" style={{ color: '#e0a49c' }}>
              {pedido > disponivel
                ? `Só tem ${formatCurrency(disponivel)} de capital disponível.`
                : pedido > falta
                  ? `Faltam apenas ${formatCurrency(falta)} para completar este projeto.`
                  : p.minTicket > 0 && pedido < p.minTicket
                    ? `O mínimo neste projeto é ${formatCurrency(p.minTicket)}.`
                    : 'Escreva um valor maior do que zero.'}
            </p>
          )}

          <button
            type="button"
            disabled={!valido || subscrever.isPending}
            onClick={() => subscrever.mutate()}
            className="inv-btn-gold mt-6 flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm sm:w-auto sm:px-10"
          >
            {subscrever.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Aplicar
          </button>
        </section>
      )}

      {/* ── Mês a mês ────────────────────────────────────────────────────── */}
      {periods.filter((x) => x.status === 'DISTRIBUTED').length > 0 && (
        <section className="inv-surface inv-enter p-6 sm:p-7">
          <p className="inv-label">Mês a mês</p>
          <div className="mt-4">
            {periods.filter((x) => x.status === 'DISTRIBUTED').map((x) => (
              <div key={x.id} className="inv-row flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm">{mesLegivel(x.month)}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Lucro do carro {formatCurrency(x.profit)} · {x.profitShare}% para investidores
                  </p>
                </div>
                <p className="inv-display shrink-0 text-base" style={{ color: 'var(--gold-200)' }}>
                  {formatCurrency(x.investorsAmount)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[var(--muted-foreground)]">
            O lucro é apurado dos fechos semanais do carro — a comissão e o aluguer da
            viatura — menos as despesas do mês.
          </p>
        </section>
      )}
    </div>
  );
}

function Dado({ titulo, valor, destaque }: {
  titulo: string; valor: string; destaque?: boolean;
}) {
  return (
    <div>
      <p className="inv-label">{titulo}</p>
      <p
        className="inv-display mt-1.5 text-2xl"
        style={destaque ? { color: 'var(--gold-200)' } : undefined}
      >
        {valor}
      </p>
    </div>
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
