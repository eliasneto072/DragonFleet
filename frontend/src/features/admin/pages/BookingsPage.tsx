// src/features/admin/pages/BookingsPage.tsx
//
// As idas à oficina: o que está marcado, onde e quando.
//
// Vive sob a área da Frota porque é sobre os carros — quem trata da frota
// trata das oficinas dela. O servidor usa a mesma área (ver `routes.ts`).

import { PageHeader } from '@/app/components/ui/page-header';
import { Wrench } from 'lucide-react';
import { BookingsAdmin } from '@/app/components/admin/bookings-admin';

export function BookingsPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Oficina"
        subtitle="Marcar, confirmar e fechar as idas à oficina — com a factura e o comprovativo no mesmo sítio"
        icon={<Wrench className="h-5 w-5" />}
      />
      <BookingsAdmin />
    </div>
  );
}
