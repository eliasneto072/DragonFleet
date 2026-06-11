// src/features/admin/components/AdminLayout.tsx

import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, DollarSign, Car, TrendingUp, Settings, FileText, MessageCircle, Bell } from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';

const NAV_ITEMS = [
  { to: '/app/admin/dashboard',  icon: LayoutDashboard, label: 'Dashboard'      },
  { to: '/app/admin/drivers',    icon: Users,           label: 'Motoristas'     },
  { to: '/app/admin/documents',  icon: FileText,        label: 'Documentos'     },
  { to: '/app/admin/financial',  icon: DollarSign,      label: 'Financeiro'     },
  { to: '/app/admin/fleet',      icon: Car,             label: 'Frotas'         },
  { to: '/app/admin/analytics',  icon: TrendingUp,      label: 'Análises'       },
  { to: '/app/admin/notifications', icon: Bell,         label: 'Notificações'   },
  { to: '/app/admin/support',    icon: MessageCircle,   label: 'Suporte'        },
  { to: '/app/admin/settings',   icon: Settings,        label: 'Configurações'  },
] as const;

export function AdminLayout() {
  const { user } = useAuth();

  if (user?.role === 'DRIVER') {
    return <Navigate to="/app/driver" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
        <nav
          aria-label="Painel Administrativo"
          className="flex gap-1 bg-white/10 p-1 rounded-full backdrop-blur-sm w-max sm:w-auto"
        >
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs sm:text-sm font-medium transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-white text-[#1D1D1D] shadow-sm'
                    : 'text-white hover:bg-white/10',
                ].join(' ')
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}