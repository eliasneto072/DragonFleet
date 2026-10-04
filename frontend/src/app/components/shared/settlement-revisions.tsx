// src/app/components/shared/settlement-revisions.tsx
//
// O histórico de correções de um fecho.
//
// ─── PORQUE É QUE ISTO É PARTILHADO ─────────────────────────────────────────
//
// Porque o administrador e o motorista têm de ver exatamente a mesma coisa.
// Duas versões deste ecrã divergiriam ao segundo mês, e divergir aqui significa
// o motorista ler uma explicação diferente da que o suporte tem à frente
// enquanto fala com ele ao telefone.
//
// A única diferença é o nome de quem corrigiu, e essa diferença é feita no
// SERVIDOR: ao motorista, `editedByName` chega nulo. Aqui não se decide nada
// sobre permissões — só se desenha o que veio.

import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { settlementsService, type SettlementRevision } from '@/features/admin/services/settlements.service';
import { formatCurrency } from '@/shared/lib/format';
import { Skeleton } from '@/app/components/ui/skeleton';

/** "17/08/2026" a partir de "2026-08-17". */
function diaCurto(valor: string): string {
  const [a, m, d] = valor.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : valor;
}

/** "4 de outubro de 2026, 14:32" */
function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-PT', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function valor(c: SettlementRevision['changes'][number], v: number | string | null): string {
  if (v === null || v === '') return '—';
  if (c.tipo === 'dinheiro') return formatCurrency(Number(v));
  if (c.tipo === 'data') return diaCurto(String(v));
  return String(v);
}

export function SettlementRevisions({ settlementId }: { settlementId: string }) {
  const q = useQuery({
    queryKey: ['settlements', settlementId, 'revisions'],
    queryFn: () => settlementsService.revisions(settlementId),
  });

  if (q.isLoading) return <Skeleton className="h-16 w-full" />;

  const revisoes = q.data?.revisions ?? [];
  // Sem correções não se diz "sem correções": a esmagadora maioria dos fechos
  // nunca foi corrigida, e uma secção vazia em todos eles só faz ruído.
  if (revisoes.length === 0) return null;

  return (
    <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        {revisoes.length === 1 ? 'Esta semana foi corrigida' : `Esta semana foi corrigida ${revisoes.length} vezes`}
      </h4>

      <ol className="mt-2 space-y-3">
        {revisoes.map((r) => (
          <li key={r.id} className="border-t border-amber-200/70 pt-2 first:border-0 first:pt-0 dark:border-amber-900/40">
            <p className="text-xs text-muted-foreground">
              {quando(r.createdAt)}
              {/* Nulo para o motorista — ver a nota no topo. */}
              {r.editedByName && <> · por {r.editedByName}</>}
            </p>

            {/* O motivo primeiro e em destaque: é a resposta à pergunta que
                leva alguém a abrir isto. */}
            <p className="mt-1 text-sm font-medium">{r.reason}</p>

            {r.changes.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {r.changes.map((c) => (
                  <li key={c.campo} className="text-xs tabular-nums text-muted-foreground">
                    {c.rotulo}:{' '}
                    <span className="line-through">{valor(c, c.antes)}</span>
                    {' → '}
                    <span className="font-medium text-foreground">{valor(c, c.depois)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
