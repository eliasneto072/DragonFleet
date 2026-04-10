import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, DollarSign, Car, TrendingUp, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/drivers',   icon: Users,           label: 'Motoristas' },
  { to: '/admin/financial', icon: DollarSign,      label: 'Financeiro' },
  { to: '/admin/fleet',     icon: Car,             label: 'Frotas' },
  { to: '/admin/analytics', icon: TrendingUp,      label: 'Análises' },
  { to: '/admin/settings',  icon: Settings,        label: 'Configurações' },
] as const;

export function AdminLayout() {
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