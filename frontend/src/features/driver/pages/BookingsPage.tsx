// src/features/driver/pages/BookingsPage.tsx
//
// O motorista marca a oficina e vê o que tem marcado.
//
// ─── O QUE ELE VÊ E O QUE NÃO VÊ ────────────────────────────────────────────
//
// Só os carros dele e só as marcações dele — e isso é garantido pelo servidor,
// não por este ecrã. Daqui ele pede e acompanha: confirmar a hora é da oficina,
// e mandar alguém buscar o carro é uma despesa que a empresa decide.
//
// O que ele PODE pedir é acompanhamento: há carros em nome da empresa que são
// dos motoristas, e certas coisas exigem lá um responsável por eles não serem
// os donos no papel.

import { useState } from 'react';
import { PageHeader } from '@/app/components/ui/page-header';
import { Button } from '@/app/components/ui/button';
import { Plus, Wrench } from 'lucide-react';
import { BookingsBoard } from '@/app/components/shared/bookings-board';
import { BookingForm } from '@/app/components/shared/booking-form';

export default function BookingsPage() {
  const [aMarcar, setAMarcar] = useState(false);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Oficina"
        subtitle="Uma revisão, uns pneus, um furo, a inspeção. Marca aqui e a empresa fica a saber"
        icon={<Wrench className="h-5 w-5" />}
      />

      {aMarcar ? (
        <BookingForm
          modo="motorista"
          onPronto={() => setAMarcar(false)}
          onCancelar={() => setAMarcar(false)}
        />
      ) : (
        <Button onClick={() => setAMarcar(true)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Marcar oficina
        </Button>
      )}

      <BookingsBoard modo="motorista" />
    </div>
  );
}
