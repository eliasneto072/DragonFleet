// src/features/invest/pages/InvestDashboardPage.tsx
//
// O painel. Responde, por esta ordem, às três perguntas de quem entra:
// quanto tenho, quanto rendeu, e quando é que posso levantar.
//
// ─── A HIERARQUIA É A MENSAGEM ──────────────────────────────────────────────
//
// Há UM número grande — o total — e mais nada a competir com ele. Capital e
// rendimento vêm por baixo, do tamanho de texto normal. A tentação de fazer
// três cartões iguais é grande e está errada: o investidor quer saber quanto
// tem, e só depois de onde vem.
//
// ─── O GRÁFICO É DE BARRAS E NÃO DE LINHA ───────────────────────────────────
//
// Uma linha sugere continuidade e variação — sobe, desce, volta a subir — e
// isto não varia: cada mês rende. Barras dizem "isto foi o que entrou em cada
// mês", que é o que se está a mostrar. E uma linha quase reta a subir num
// produto financeiro parece um gráfico de bolsa, que é exatamente a ideia
// errada.

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock, TrendingUp } from 'lucide-react';
import { investorsService } from '@/shared/services/investors.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import { Skeleton } from '@/app/components/ui/skeleton';
import { MovementRow, dia, mesLegivel } from '../components/invest-bits';

export function InvestDashboardPage() {
  const meQ = useQuery({ queryKey: queryKeys.investors.me, queryFn: () => investorsService.me() });
  const mensalQ = useQuery({
    queryKey: queryKeys.investors.monthly('me'),
    queryFn: () => investorsService.monthly(),
  });

  if (meQ.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (meQ.isError || !meQ.data) {
    return (
      <p className="inv-surface p-6 text-sm text-[var(--muted-foreground)]">
        Não foi possível carregar a sua conta. Atualize a página ou tente daqui a pouco.
      </p>
    );
  }

  const { account, balance, projection, pendingWithdrawals, recentMovements } = meQ.data;
  const meses = mensalQ.data?.months ?? [];

  return (
    <div className="space-y-6">
      {/* ── O cartão principal ───────────────────────────────────────────── */}
      <section className="inv-surface-gold inv-enter p-7 sm:p-10">
        <p className="inv-label">Valor total da sua conta</p>

        <p className="inv-display mt-3 text-5xl leading-none sm:text-6xl">
          <span className="inv-gold-text">{formatCurrency(balance.total)}</span>
        </p>

        <div className="mt-7 grid gap-5 sm:grid-cols-3">
          <Valor titulo="Capital aplicado" valor={balance.capital} />
          <Valor titulo="Rendimento acumulado" valor={balance.earnings} destaque />
          <Valor titulo="Taxa em vigor" texto={`${account.annualRate}% ao ano`} />
        </div>

        <hr className="inv-rule my-7" />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-[var(--muted-foreground)]">
            A render desde {dia(account.startDate)}
            {account.noticeDays > 0 && ` · Aviso prévio de ${account.noticeDays} dias para resgatar capital`}
          </p>
          <Link
            to="/resgates"
            className="inv-btn-gold inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-sm"
          >
            Pedir resgate
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* ── A projeção ───────────────────────────────────────────────────── */}
      <section className="inv-surface inv-enter p-6 sm:p-7">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[var(--gold-400)]" aria-hidden="true" />
          <p className="inv-label">Ao ritmo de hoje</p>
        </div>

        <div className="mt-5 grid gap-6 sm:grid-cols-3">
          <Projecao titulo="Por dia" valor={projection.day} />
          <Projecao titulo="Em 30 dias" valor={projection.month} />
          <Projecao titulo="Em 12 meses" valor={projection.year} />
        </div>

        {/* A ressalva é obrigatória e fica à vista, não em letra miudinha. Um
            número projetado sem esta frase é uma promessa. */}
        <p className="mt-5 text-xs leading-relaxed text-[var(--muted-foreground)]">
          Estimativa calculada sobre o capital e a taxa atuais. Reforços, resgates
          ou uma alteração de taxa mudam estes valores.
        </p>
      </section>

      {/* ── Pedidos por decidir ──────────────────────────────────────────── */}
      {pendingWithdrawals.length > 0 && (
        <section className="inv-surface inv-enter p-6">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--gold-400)]" aria-hidden="true" />
            <p className="inv-label">Resgates a aguardar decisão</p>
          </div>
          <ul className="mt-4 space-y-2">
            {pendingWithdrawals.map((w) => (
              <li key={w.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span>
                  {formatCurrency(w.amount)}
                  <span className="ml-2 text-[var(--muted-foreground)]">
                    {w.bucket === 'CAPITAL' ? 'de capital' : 'de rendimento'}
                  </span>
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  Pagável a partir de {dia(w.availableOn)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Rendimento mês a mês ─────────────────────────────────────────── */}
      {meses.length > 0 && (
        <section className="inv-surface inv-enter p-6 sm:p-7">
          <p className="inv-label">Rendimento por mês</p>
          <GraficoMensal meses={meses} />
        </section>
      )}

      {/* ── Últimos movimentos ───────────────────────────────────────────── */}
      <section className="inv-surface inv-enter p-6 sm:p-7">
        <div className="flex items-baseline justify-between gap-3">
          <p className="inv-label">Últimos movimentos</p>
          <Link to="/extrato" className="text-xs text-[var(--gold-300)] hover:underline">
            Ver extrato completo
          </Link>
        </div>

        {recentMovements.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">
            Ainda não há movimentos. O primeiro aparece assim que o depósito for registado.
          </p>
        ) : (
          <div className="mt-4">
            {recentMovements.map((m) => <MovementRow key={m.id} m={m} />)}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Peças ──────────────────────────────────────────────────────────────────

function Valor({ titulo, valor, texto, destaque }: {
  titulo: string; valor?: number; texto?: string; destaque?: boolean;
}) {
  return (
    <div>
      <p className="inv-label">{titulo}</p>
      <p
        className="inv-display mt-1.5 text-2xl"
        style={destaque ? { color: 'var(--gold-200)' } : undefined}
      >
        {texto ?? formatCurrency(valor ?? 0)}
      </p>
    </div>
  );
}

function Projecao({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div>
      <p className="inv-label">{titulo}</p>
      <p className="inv-display mt-1.5 text-2xl">+ {formatCurrency(valor)}</p>
    </div>
  );
}

/**
 * Barras em CSS, sem biblioteca de gráficos.
 *
 * São doze valores positivos com uma escala só. Trazer uma dependência de
 * gráficos para isto acrescentaria peso à página por um resultado que não
 * seria melhor — e obrigaria a lutar contra os temas dela para a barra ficar
 * dourada.
 */
function GraficoMensal({ meses }: { meses: { month: string; amount: number }[] }) {
  const ultimos = meses.slice(-12);
  const maximo = Math.max(...ultimos.map((m) => m.amount), 0.01);

  return (
    <div className="mt-5">
      <div className="flex h-36 items-end gap-1.5 sm:gap-2">
        {ultimos.map((m) => (
          <div key={m.month} className="group flex flex-1 flex-col items-center justify-end gap-2">
            {/* O valor aparece ao passar o rato: escrito sempre, doze números
                pequenos encavalitavam-se em telemóvel. */}
            <span className="inv-display text-[11px] opacity-0 transition-opacity group-hover:opacity-100">
              {formatCurrency(m.amount)}
            </span>
            <div
              className="w-full rounded-sm transition-all"
              style={{
                height: `${Math.max(3, (m.amount / maximo) * 100)}%`,
                background: 'linear-gradient(180deg, #e0c98a 0%, #c9a227 60%, #8c6f18 100%)',
                opacity: 0.85,
              }}
              title={`${mesLegivel(m.month)}: ${formatCurrency(m.amount)}`}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-1.5 sm:gap-2">
        {ultimos.map((m) => (
          <p
            key={m.month}
            className="flex-1 text-center text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]"
          >
            {mesLegivel(m.month).slice(0, 3)}
          </p>
        ))}
      </div>
    </div>
  );
}
