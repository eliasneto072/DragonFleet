import { Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Toaster } from '@/app/components/ui/sonner';
import { BRAND } from '@/shared/constants';
import { useAuth } from '@/features/auth/context/AuthContext';
import { DragonFleetLogo } from '@/app/components/DragonFleetLogo';

export function RootLayout() {
  const { pathname }              = useLocation();
  const navigate                  = useNavigate();
  const { user, isAuthenticated, loading, logout } = useAuth();

  const isAdmin = pathname.startsWith('/app/admin');

  // Enquanto restaura a sessão do token salvo, não renderiza nada
  // (evita flash de redirect para /login quando o usuário já está logado)
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

  // Sem sessão → manda para login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Motorista tentando acessar o painel admin → redireciona para o portal dele
  if (isAdmin && user?.role === 'DRIVER') {
    return <Navigate to="/app/driver" replace />;
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#1D1D1D]">
      <Toaster />

      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">

            {/* Logo */}
            <div className="flex flex-col">
              <DragonFleetLogo size={44} />
              <p className="text-xs text-muted-foreground ml-1 mt-0.5">
                {isAdmin ? 'Painel Administrativo' : 'Portal do Motorista'}
              </p>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-4">

              {/* Nome do usuário logado */}
              {user && (
                <span className="text-sm text-[#1D1D1D] hidden md:block">
                  Olá, <strong className="text-[#108865]">{user.name.split(' ')[0]}</strong>
                </span>
              )}

              {/* Só admins/managers veem o botão de trocar de portal */}
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

              {/* Logout */}
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                title="Sair"
                onClick={handleLogout}
              >
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