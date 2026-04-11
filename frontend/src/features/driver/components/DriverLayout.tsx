// src/features/driver/components/DriverLayout.tsx

import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { LayoutDashboard, Wallet, FileText, User, Bell, MessageCircle } from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';

const NAV_ITEMS = [
  { to: '/app/driver/dashboard',     icon: LayoutDashboard, label: 'Dashboard'    },
  { to: '/app/driver/withdrawals',   icon: Wallet,          label: 'Retiradas'    },
  { to: '/app/driver/documents',     icon: FileText,        label: 'Documentos'   },
  { to: '/app/driver/profile',       icon: User,            label: 'Perfil'       },
  { to: '/app/driver/notifications', icon: Bell,            label: 'Notificações' },
  { to: '/app/driver/support',       icon: MessageCircle,   label: 'Suporte'      },
] as const;

export function DriverLayout() {
  const { user } = useAuth();

  // Admin/Manager que entrou em /driver por engano → manda para o painel deles
  // (proteção dupla — o RootLayout já faz o inverso, mas aqui garante)
  if (user && user.role !== 'DRIVER') {
    return <Navigate to="/app/admin" replace />;
  }

  return (
    <div className="space-y-6">
      <nav
        aria-label="Portal do Motorista"
        className="flex flex-wrap gap-1 bg-white/10 p-1 rounded-full backdrop-blur-sm"
      >
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors',
                isActive
                  ? 'bg-white text-[#1D1D1D] shadow-sm'
                  : 'text-white hover:bg-white/10',
              ].join(' ')
            }
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="hidden lg:inline">{label}</span>
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}