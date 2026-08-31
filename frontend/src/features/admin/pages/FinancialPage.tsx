// src/features/admin/pages/FinancialPage.tsx
//
// Duas abas: as retiradas e os dados bancários por aprovar.
//
// Ficam juntos porque servem a mesma tarefa: quem aprova um IBAN é quem a
// seguir o copia para o banco. Separar em dois itens de menu obrigaria a saltar
// entre telas a meio do trabalho, e o menu do administrador já tem onze
// entradas.
//
// O CONTADOR NA ABA existe porque a fila do painel não sabe nada de dados
// bancários: o /analytics/overview conta documentos, retiradas e lançamentos,
// e mais nada. Sem este número, um motorista podia submeter o IBAN e ficar à
// espera indefinidamente, porque ninguém tem motivo para abrir a aba. Trazer
// isto para a fila do painel implica mexer no agregado em SQL e fica para
// assunto próprio; o contador resolve o hoje sem tocar no backend.
//
// A aba abre por defeito nas retiradas; a fila do painel pode encaminhar para
// a aprovação através de `state.tab`, como já faz com a revisão de lançamentos.

import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FinancialControl } from '@/app/components/admin/financial-control';
import { BankApprovals } from '@/app/components/admin/bank-approvals';
import { PageHeader } from '@/app/components/ui/page-header';
import { DollarSign } from 'lucide-react';
import { bankService } from '@/shared/services/bank.service';
import { queryKeys } from '@/shared/lib/query-keys';

type Tab = 'withdrawals' | 'bank';

export function FinancialPage() {
  const location = useLocation();
  const state = (location.state ?? {}) as { tab?: Tab };
  const [tab, setTab] = useState<Tab>(state.tab === 'bank' ? 'bank' : 'withdrawals');

  // A mesma consulta que a aba usa: o React Query serve as duas do mesmo
  // cache, por isso o contador não custa um pedido a mais.
  const pendingQ = useQuery({
    queryKey: queryKeys.bank.pending,
    // Só a contagem interessa aqui: pede-se uma página de 1 e lê-se o total.
    queryFn: () => bankService.listPending({ pageSize: 1 }),
  });

  const pendingCount = pendingQ.data?.page.total ?? 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Financeiro"
        subtitle="Retiradas dos motoristas e posição da empresa"
        icon={<DollarSign className="h-5 w-5" />}
      />

      <div className="flex gap-1 border-b border-border">
        {([
          { key: 'withdrawals', label: 'Retiradas', count: 0 },
          { key: 'bank', label: 'Dados bancários', count: pendingCount },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            {count > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'withdrawals' ? <FinancialControl hideHeader /> : <BankApprovals />}
    </div>
  );
}
