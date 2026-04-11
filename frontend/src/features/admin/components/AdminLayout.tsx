// src/features/admin/components/AdminLayout.tsx

import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, DollarSign, Car, TrendingUp, Settings } from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';

const NAV_ITEMS = [
  { to: '/app/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard'      },
  { to: '/app/admin/drivers',   icon: Users,           label: 'Motoristas'    },
  { to: '/app/admin/financial', icon: DollarSign,      label: 'Financeiro'    },
  { to: '/app/admin/fleet',     icon: Car,             label: 'Frotas'        },
  { to: '/app/admin/analytics', icon: TrendingUp,      label: 'Análises'      },
  { to: '/app/admin/settings',  icon: Settings,        label: 'Configurações' },
] as const;

export function AdminLayout() {
  const { user } = useAuth();

  // Motorista tentando acessar /admin → manda de volta para o portal dele
  if (user?.role === 'DRIVER') {
    return <Navigate to="/app/driver" replace />;
  }

  return (
    <div className="space-y-6">
      <nav
        aria-label="Painel Administrativo"
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