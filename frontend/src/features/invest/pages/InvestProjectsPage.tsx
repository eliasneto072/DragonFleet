// src/features/invest/pages/InvestProjectsPage.tsx
//
// Os projetos, no portal do investidor.
//
// ─── O QUE CADA CARTÃO TEM DE DIZER ─────────────────────────────────────────
//
// Um projeto aberto responde a três perguntas, por esta ordem: quanto falta
// para fechar, quanto do lucro é meu, e quanto é que já lá pus. É essa ordem
// que decide se ele entra — e uma barra de financiamento diz mais em meio
// segundo do que qualquer frase.
//
// Um projeto a render responde a outras: quanto já distribuiu, e qual é a
// minha parte disso. Por isso o mesmo cartão muda de conteúdo conforme o
// estado, em vez de mostrar campos vazios.

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Car, TrendingUp } from 'lucide-react';
import {
  projectsService, ESTADO_DO_PROJETO, type ProjectListItem,
} from '@/shared/services/projects.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import { Skeleton } from '@/app/components/ui/skeleton';

export function InvestProjectsPage() {
  const q = useQuery({
    queryKey: queryKeys.projects.list('', ''),
    queryFn: () => projectsService.list(),
  });

  const projetos = q.data?.projects ?? [];
  const abertos = projetos.filter((p) => p.status === 'FUNDING');
  const aRender = projetos.filter((p) => p.status === 'ACTIVE');
  const fechados = projetos.filter((p) => ['CLOSED', 'CANCELLED'].includes(p.status));

  return (
    <div className="space-y-8">
      <header className="inv-enter">
        <h1 className="inv-display text-3xl">Projetos</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Financie um carro da frota e receba uma parte do que ele der, todos os meses.
        </p>
      </header>

      {q.isLoading && <Skeleton className="h-52 w-full rounded-xl" />}

      {!q.isLoading && projetos.length === 0 && (
        <section className="inv-surface inv-enter p-10 text-center">
          <Car className="mx-auto h-8 w-8 text-[var(--gold-400)]" aria-hidden="true" />
          <p className="inv-display mt-4 text-xl">Ainda não há projetos abertos</p>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Quando abrirmos um carro a financiamento, aparece aqui e recebe um aviso.
          </p>
        </section>
      )}

      <Grupo titulo="Abertos a financiamento" projetos={abertos} />
      <Grupo titulo="A render" projetos={aRender} />
      <Grupo titulo="Histórico" projetos={fechados} />
    </div>
  );
}

function Grupo({ titulo, projetos }: { titulo: string; projetos: ProjectListItem[] }) {
  if (projetos.length === 0) return null;
  return (
    <section className="inv-enter">
      <p className="inv-label">{titulo}</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {projetos.map((p) => <Cartao key={p.id} p={p} />)}
      </div>
    </section>
  );
}

function Cartao({ p }: { p: ProjectListItem }) {
  const pct = p.targetAmount > 0
    ? Math.min(100, Math.round((p.raised / p.targetAmount) * 100))
    : 0;
  const falta = Math.max(0, p.targetAmount - p.raised);

  return (
    <Link
      to={`/projetos/${p.id}`}
      className={`block p-6 transition-transform hover:-translate-y-0.5 ${
        p.status === 'FUNDING' ? 'inv-surface-gold' : 'inv-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="inv-display truncate text-2xl">{p.name}</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {p.vehicle ? `${p.vehicle.brand} ${p.vehicle.model} · ${p.vehicle.plate}` : 'Carro por atribuir'}
          </p>
        </div>
        <span className={`inv-chip shrink-0 ${p.status === 'FUNDING' ? 'inv-chip-gold' : ''}`}>
          {ESTADO_DO_PROJETO[p.status]}
        </span>
      </div>

      {/* A angariar: a barra e o que falta. */}
      {p.status === 'FUNDING' && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between text-sm">
            <span className="inv-display text-xl">{formatCurrency(p.raised)}</span>
            <span className="text-[var(--muted-foreground)]">
              de {formatCurrency(p.targetAmount)}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: 'rgba(255,255,255,0.12)' }}
          >
            <div
              className="h-full rounded-full transition-all"
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

      {/* A render: o que já distribuiu. */}
      {p.status === 'ACTIVE' && (
        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="inv-label">Já distribuído</p>
            <p className="inv-display mt-1 text-2xl">{formatCurrency(p.distributed)}</p>
          </div>
          <TrendingUp className="h-5 w-5 text-[var(--gold-400)]" aria-hidden="true" />
        </div>
      )}

      <hr className="inv-rule my-5" />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="text-[var(--muted-foreground)]">
          {p.profitShare}% do lucro para os investidores
          {p.minTicket > 0 && ` · mínimo ${formatCurrency(p.minTicket)}`}
        </span>
        {p.myAmount > 0 && (
          <span style={{ color: 'var(--gold-200)' }}>
            Tem {formatCurrency(p.myAmount)} aplicados
          </span>
        )}
      </div>
    </Link>
  );
}
