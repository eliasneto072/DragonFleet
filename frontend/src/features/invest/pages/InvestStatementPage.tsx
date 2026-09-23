// src/features/invest/pages/InvestStatementPage.tsx
//
// O extrato completo, com filtro por tipo e paginação.
//
// Aqui há uma linha por DIA de juro, o que faz uma conta com um ano ter perto
// de quatrocentas linhas. É de propósito: o investidor tem de poder verificar
// o rendimento dia a dia, e um total mensal sem as parcelas é um número que
// se acredita em vez de se conferir. O filtro existe para quem só quer ver os
// depósitos não ter de passar por elas.

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { investorsService, type MovementKind } from '@/shared/services/investors.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { Skeleton } from '@/app/components/ui/skeleton';
import { MovementRow, nomeDoTipo } from '../components/invest-bits';

const TIPOS: (MovementKind | 'TODOS')[] = ['TODOS', 'ACCRUAL', 'DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT'];
const POR_PAGINA = 40;

export function InvestStatementPage() {
  const [pagina, setPagina] = useState(1);
  const [tipo, setTipo] = useState<MovementKind | 'TODOS'>('TODOS');

  const q = useQuery({
    queryKey: queryKeys.investors.statement('me', pagina, tipo),
    queryFn: () => investorsService.statement({
      page: pagina,
      pageSize: POR_PAGINA,
      kind: tipo === 'TODOS' ? undefined : tipo,
    }),
    // Sem isto a lista pisca para vazio a cada mudança de página, e a altura da
    // página salta.
    placeholderData: keepPreviousData,
  });

  const total = q.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  function mudarTipo(t: MovementKind | 'TODOS') {
    setTipo(t);
    setPagina(1); // ficar na página 7 de um filtro novo daria uma lista vazia
  }

  return (
    <div className="space-y-6">
      <header className="inv-enter">
        <h1 className="inv-display text-3xl">Extrato</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Todos os movimentos da sua conta, do mais recente para o mais antigo.
        </p>
      </header>

      <div className="inv-enter flex flex-wrap gap-2">
        {TIPOS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => mudarTipo(t)}
            aria-pressed={tipo === t}
            className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
              tipo === t
                ? 'border-[rgba(201,162,39,0.5)] bg-[rgba(201,162,39,0.12)] text-[var(--gold-200)]'
                : 'border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            {t === 'TODOS' ? 'Todos' : nomeDoTipo(t)}
          </button>
        ))}
      </div>

      <section className="inv-surface inv-enter p-5 sm:p-7">
        {q.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : !q.data || q.data.movements.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            Não há movimentos deste tipo.
          </p>
        ) : (
          <>
            <div>
              {q.data.movements.map((m) => <MovementRow key={m.id} m={m} />)}
            </div>

            {paginas > 1 && (
              <div className="mt-6 flex items-center justify-between gap-4">
                <p className="text-xs text-[var(--muted-foreground)]">
                  Página {pagina} de {paginas} · {total} movimentos
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    disabled={pagina === 1}
                    className="inv-btn-ghost rounded-md p-2 disabled:opacity-35"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPagina((p) => Math.min(paginas, p + 1))}
                    disabled={pagina >= paginas}
                    className="inv-btn-ghost rounded-md p-2 disabled:opacity-35"
                    aria-label="Página seguinte"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
