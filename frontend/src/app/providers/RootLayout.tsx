import { Outlet, useLocation, Link } from 'react-router-dom';
import { Car, LogOut } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Toaster } from '@/app/components/ui/sonner';
import { BRAND } from '@/shared/constants';

export function RootLayout() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');

  return (
    <div className="min-h-screen bg-[#1D1D1D]">
      <Toaster />

      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">

            <div className="flex items-center gap-3">
              <div className="h-12 w-12 bg-gradient-to-br from-[#1D1D1D] to-[#108865] rounded-xl flex items-center justify-center shadow-lg">
                <Car className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#1D1D1D]">{BRAND.name}</h1>
                <p className="text-xs text-muted-foreground">
                  {isAdmin ? 'Painel Administrativo' : 'Portal do Motorista'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Link to={isAdmin ? '/driver' : '/admin'}>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#1D1D1D] text-[#1D1D1D] hover:bg-[#108865] hover:text-white hover:border-[#108865] rounded-full font-semibold"
                >
                  {isAdmin ? 'Ver como Motorista' : 'Ver como Admin'}
                </Button>
              </Link>
              <Button variant="ghost" size="sm" className="rounded-full">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>

          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>

      <footer className="bg-[#1D1D1D] border-t border-white/10 mt-12">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-white">
              © 2026 {BRAND.name}. Todos os direitos reservados.
            </p>
            <div className="flex gap-6 text-sm">
              <a href="#" className="text-white hover:text-[#108865] transition-colors">Termos de Uso</a>
              <a href="#" className="text-white hover:text-[#108865] transition-colors">Política de Privacidade</a>
              <a href="#" className="text-white hover:text-[#108865] transition-colors">Suporte</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}