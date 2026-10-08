// src/features/workshop/pages/WorkshopBookingsPage.tsx
//
// O que a oficina tem para fazer: confirmar, propor outra hora, ou recusar —
// e no fim fechar com o que custou e a factura.
//
// É a MESMA lista que a frota vê, filtrada por oficina no servidor. Uma oficina
// não vê as marcações da oficina do lado.

import { PageHeader } from '@/app/components/ui/page-header';
import { Wrench } from 'lucide-react';
import { BookingsBoard } from '@/app/components/shared/bookings-board';

export default function WorkshopBookingsPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Marcações"
        subtitle="Os carros que a frota e os motoristas marcaram — confirme a hora ou proponha outra"
        icon={<Wrench className="h-5 w-5" />}
      />
      <BookingsBoard modo="oficina" />
    </div>
  );
}
