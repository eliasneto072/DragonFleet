// src/features/invest/pages/InvestAccountPage.tsx
//
// A página da conta: os dados do contrato, as notificações e a saída.
//
// Não há nada para editar aqui. Taxa, aviso prévio e data de início são
// condições acordadas — mudá-las é assunto entre o investidor e a
// administração, não um campo num formulário. Mostrar isto em modo leitura é a
// forma honesta de dizer "estas são as suas condições, e não mudam sozinhas".

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { investorsService } from '@/shared/services/investors.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { useAuth } from '@/features/auth/context/AuthContext';
import { formatCurrency } from '@/shared/lib/format';
import { Skeleton } from '@/app/components/ui/skeleton';
import { dia } from '../components/invest-bits';
import { resumirMensagem } from '@/shared/lib/notification-format';

export function InvestAccountPage() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();

  const meQ = useQuery({ queryKey: queryKeys.investors.me, queryFn: () => investorsService.me() });
  const notifQ = useQuery({
    queryKey: queryKeys.investors.notifications,
    queryFn: () => investorsService.notifications(),
  });

  const marcarLida = useMutation({
    mutationFn: (id: string) => investorsService.readNotification(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.investors.notifications }),
  });

  return (
    <div className="space-y-6">
      <header className="inv-enter">
        <h1 className="inv-display text-3xl">A sua conta</h1>
      </header>

      {/* ── Identificação ────────────────────────────────────────────────── */}
      <section className="inv-surface inv-enter p-6 sm:p-7">
        <p className="inv-label">Titular</p>
        <p className="inv-display mt-2 text-2xl">{user?.name ?? '—'}</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{user?.email}</p>
      </section>

      {/* ── Condições ────────────────────────────────────────────────────── */}
      <section className="inv-surface inv-enter p-6 sm:p-7">
        <p className="inv-label">Condições</p>

        {meQ.isLoading || !meQ.data ? (
          <Skeleton className="mt-4 h-24 w-full rounded-md" />
        ) : (
          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            <Dado termo="Taxa anual" valor={`${meQ.data.account.annualRate}%`} />
            <Dado termo="A render desde" valor={dia(meQ.data.account.startDate)} />
            <Dado
              termo="Aviso prévio para resgatar capital"
              valor={meQ.data.account.noticeDays === 0
                ? 'Sem aviso prévio'
                : `${meQ.data.account.noticeDays} dias`}
            />
            <Dado termo="Capital aplicado" valor={formatCurrency(meQ.data.balance.capital)} />
          </dl>
        )}

        <p className="mt-6 text-xs leading-relaxed text-[var(--muted-foreground)]">
          Para alterar qualquer destas condições, ou os seus dados bancários,
          fale com a administração.
        </p>
      </section>

      {/* ── Notificações ─────────────────────────────────────────────────── */}
      <section className="inv-surface inv-enter p-6 sm:p-7">
        <p className="inv-label">Avisos</p>

        {notifQ.isLoading ? (
          <Skeleton className="mt-4 h-20 w-full rounded-md" />
        ) : !notifQ.data?.notifications.length ? (
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">Não há avisos.</p>
        ) : (
          <div className="mt-4">
            {notifQ.data.notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => !n.read && marcarLida.mutate(n.id)}
                className="inv-row block w-full py-3 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm ${n.read ? 'text-[var(--muted-foreground)]' : ''}`}>
                      {n.title}
                    </p>
                    {/* Uma linha só: a lista de avisos da conta é uma lista, e
                        o aviso todo abre-se em Notificações. */}
                    <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                      {resumirMensagem(n.message)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* O ponto é a única marca de "por ler". Um fundo diferente
                        na linha inteira tornava a lista num mosaico. */}
                    {!n.read && (
                      <span
                        className="mt-1 h-1.5 w-1.5 rounded-full"
                        style={{ background: 'var(--gold-400)' }}
                        aria-label="Por ler"
                      />
                    )}
                    <span className="text-[11px] text-[var(--muted-foreground)]">
                      {dia(n.createdAt)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => { void logout(); }}
        className="inv-btn-ghost inv-enter flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm sm:w-auto sm:px-8"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Terminar sessão
      </button>
    </div>
  );
}

function Dado({ termo, valor }: { termo: string; valor: string }) {
  return (
    <div>
      <dt className="inv-label">{termo}</dt>
      <dd className="inv-display mt-1 text-xl">{valor}</dd>
    </div>
  );
}
