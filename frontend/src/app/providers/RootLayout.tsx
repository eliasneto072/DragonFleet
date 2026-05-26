// src/app/providers/RootLayout.tsx

import { useState } from 'react';
import { Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Toaster } from '@/app/components/ui/sonner';
import { BRAND } from '@/shared/constants';
import { useAuth } from '@/features/auth/context/AuthContext';
import { DragonFleetLogo } from '@/app/components/DragonFleetLogo';

export function RootLayout() {
  const { pathname }  = useLocation();
  const navigate      = useNavigate();
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = pathname.startsWith('/app/admin');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1D1D1D] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <DragonFleetLogo iconOnly size={56} />
          <p className="text-white/60 text-sm">Carregando…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isAdmin && user?.role === 'DRIVER') return <Navigate to="/app/driver" replace />;

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#1D1D1D]">
      <Toaster />

      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">

            {/* Logo */}
            <div className="flex flex-col shrink-0">
              <DragonFleetLogo size={40} />
              <p className="text-xs text-muted-foreground ml-1 mt-0.5 hidden sm:block">
                {isAdmin ? 'Painel Administrativo' : 'Portal do Motorista'}
              </p>
            </div>

            {/* Ações — desktop */}
            <div className="hidden sm:flex items-center gap-3">
              {user && (
                <span className="text-sm text-[#1D1D1D]">
                  Olá, <strong className="text-[#108865]">{user.name.split(' ')[0]}</strong>
                </span>
              )}
              {user?.role !== 'DRIVER' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#1D1D1D] text-[#1D1D1D] hover:bg-[#108865] hover:text-white hover:border-[#108865] rounded-full font-semibold"
                  onClick={() => navigate(isAdmin ? '/app/driver' : '/app/admin')}
                >
                  {isAdmin ? 'Ver como Motorista' : 'Ver como Admin'}
                </Button>
              )}
              <Button variant="ghost" size="sm" className="rounded-full" title="Sair" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>

            {/* Menu hamburguer — mobile */}
            <div className="flex sm:hidden items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setMenuOpen(v => !v)}>
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {/* Menu mobile expandido */}
          {menuOpen && (
            <div className="sm:hidden mt-3 pb-2 flex flex-col gap-2 border-t pt-3">
              {user && (
                <p className="text-sm text-[#1D1D1D] px-1">
                  Olá, <strong className="text-[#108865]">{user.name.split(' ')[0]}</strong>
                </p>
              )}
              {user?.role !== 'DRIVER' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-[#1D1D1D] text-[#1D1D1D] hover:bg-[#108865] hover:text-white hover:border-[#108865] rounded-full font-semibold"
                  onClick={() => { navigate(isAdmin ? '/app/driver' : '/app/admin'); setMenuOpen(false); }}
                >
                  {isAdmin ? 'Ver como Motorista' : 'Ver como Admin'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full rounded-full text-red-600 border-red-200 hover:bg-red-50"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="bg-[#1D1D1D] border-t border-white/10 mt-12">
        <div className="container mx-auto px-4 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-white text-center sm:text-left">
              © 2026 {BRAND.name}. Todos os direitos reservados.
            </p>
            <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-sm">
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