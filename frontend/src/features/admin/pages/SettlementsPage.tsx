// src/features/admin/pages/SettlementsPage.tsx
//
// Duas abas: os fechos semanais e os lançamentos por confirmar.
//
// Ficam juntos porque servem a mesma tarefa: o que o motorista comunica é
// conferência para quem fecha a semana. Separar em dois itens de menu obrigaria
// a saltar entre telas a meio do trabalho, e o menu do administrador já tem dez
// entradas.
//
// A aba abre por defeito nos fechos; a fila do painel encaminha para a revisão
// através de `state.tab`.

import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AdminSettlements } from '@/app/components/admin/admin-settlements';
import { EarningsReview } from '@/app/components/admin/earnings-review';
import { PageHeader } from '@/app/components/ui/page-header';
import { ReceiptText } from 'lucide-react';

type Tab = 'settlements' | 'review';

export function SettlementsPage() {
  const location = useLocation();
  const state = (location.state ?? {}) as { tab?: Tab };
  const [tab, setTab] = useState<Tab>(state.tab === 'review' ? 'review' : 'settlements');

  // A tela de fechos traz o seu próprio PageHeader; com abas, o cabeçalho sobe
  // para aqui e ela passa a renderizar só a lista.
  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Registo semanal de faturação"
        subtitle="Fechos por motorista e valores comunicados"
        icon={<ReceiptText className="h-5 w-5" />}
      />

      <div className="flex gap-1 border-b border-border">
        {([
          { key: 'settlements', label: 'Fechos' },
          { key: 'review', label: 'Por confirmar' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'settlements' ? <AdminSettlements hideHeader /> : <EarningsReview />}
    </div>
  );
}
