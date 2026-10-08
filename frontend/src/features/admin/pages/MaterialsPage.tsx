// src/features/admin/pages/MaterialsPage.tsx
//
// O material: o que há, o que se gastou, e quanto custou em cada carro.
//
// Vive sob a área da Frota, como a Oficina: o material é material dos carros.
// O servidor exige a mesma área, e recusa o motorista mesmo que a tela dele
// algum dia tente chegar aqui.

import { PageHeader } from '@/app/components/ui/page-header';
import { Boxes } from 'lucide-react';
import { MaterialsAdmin } from '@/app/components/admin/materials-admin';

export function MaterialsPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Material"
        subtitle="Stock, consumos e o que cada carro gasta de material — a metade do custo que não vem em factura"
        icon={<Boxes className="h-5 w-5" />}
      />
      <MaterialsAdmin />
    </div>
  );
}
