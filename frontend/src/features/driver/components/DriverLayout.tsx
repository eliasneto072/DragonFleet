// src/features/driver/components/DriverLayout.tsx

import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Wallet, FileText, User, Bell, MessageCircle, Car } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/app/driver/dashboard',     icon: LayoutDashboard, label: 'Dashboard'    },
  { to: '/app/driver/withdrawals',   icon: Wallet,          label: 'Retiradas'    },
  { to: '/app/driver/documents',     icon: FileText,        label: 'Documentos'   },
  { to: '/app/driver/vehicles',      icon: Car,             label: 'Veículos'     },
  { to: '/app/driver/profile',       icon: User,            label: 'Perfil'       },
  { to: '/app/driver/notifications', icon: Bell,            label: 'Notificações' },
  { to: '/app/driver/support',       icon: MessageCircle,   label: 'Suporte'      },
] as const;

export function DriverLayout() {
  return (
    <div className="space-y-6">
      {/* Nav com scroll horizontal no mobile */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
        <nav
          aria-label="Portal do Motorista"
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