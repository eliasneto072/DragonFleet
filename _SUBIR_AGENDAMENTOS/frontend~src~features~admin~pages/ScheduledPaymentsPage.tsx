// src/features/admin/pages/ScheduledPaymentsPage.tsx
//
// Pagamentos que saem ou entram sozinhos, numa data.
//
// Tem menu próprio e não uma aba dentro do Financeiro porque foi assim que o
// cliente o descreveu — e porque é um sítio onde se entra de propósito, uma vez
// por mês, e não um passo de outra tarefa.

import { PageHeader } from '@/app/components/ui/page-header';
import { CalendarClock } from 'lucide-react';
import { ScheduledPayments } from '@/app/components/admin/scheduled-payments';

export function ScheduledPaymentsPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Agendamentos"
        subtitle="Pagamentos que entram ou saem do saldo na data certa, sem ninguém se lembrar deles"
        icon={<CalendarClock className="h-5 w-5" />}
      />
      <ScheduledPayments />
    </div>
  );
}
