// src/features/workshop/components/WorkshopLayout.tsx
//
// A moldura do portal da oficina.
//
// ─── PORQUE É QUE NÃO USA A MOLDURA DA FROTA ────────────────────────────────
//
// O painel da frota tem barra lateral porque tem vinte telas. Este tem UMA, e
// é de propósito: uma conta de oficina só pode abrir as marcações — o servidor
// recusa-lhe todo o resto (ver `deny-mechanic.middleware.ts`). Uma barra
// lateral com uma entrada só gastava um quinto do ecrã para dizer onde já se
// está, e prometia um menu que não existe.
//
// Por isso: barra fina em cima com o nome da oficina, e o resto é a lista.
//
// ─── O NOME DA OFICINA VEM DO SERVIDOR ──────────────────────────────────────
//
// `/bookings/workshops` devolve a um mecânico APENAS a oficina dele. É o que
// escreve o nome aqui em cima — e é também o aviso quando a conta ainda não
// está ligada a nenhuma: sem oficina não há marcações para ver, e um ecrã
// vazio sem explicação parece uma avaria.

import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Wrench } from 'lucide-react';
import { Toaster } from '@/app/components/ui/sonner';
import { DragonFleetLogo } from '@/app/components/DragonFleetLogo';
import { ThemeToggle } from '@/app/components/ui/theme-toggle';
import { Card, CardContent } from '@/app/components/ui/card';
import { useAuth } from '@/features/auth/context/AuthContext';
import { bookingsService } from '@/features/admin/services/bookings.service';

export function WorkshopLayout() {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading, logout } = useAuth();

  const oficinaQ = useQuery({
    queryKey: ['bookings', 'workshops'],
    queryFn: () => bookingsService.listWorkshops(),
    enabled: isAuthenticated && user?.role === 'MECHANIC',
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <DragonFleetLogo iconOnly size={56} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Quem não é da oficina não tem nada para ver aqui — o painel dele é outro.
  if (user?.role !== 'MECHANIC') return <Navigate to="/app" replace />;

  const oficina = oficinaQ.data?.workshops?.[0] ?? null;
  const semOficina = oficinaQ.isSuccess && !oficina;

  async function sair() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <DragonFleetLogo size={32} iconOnly />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {oficina?.name ?? 'Portal da Oficina'}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user?.name}</p>
          </div>
          <ThemeToggle />
          <button
            onClick={sair}
            title="Sair"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {semOficina ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Wrench className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">Esta conta ainda não está ligada a uma oficina</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Fale com a frota para a associarem à sua oficina. Até lá não há
                marcações para ver aqui.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
