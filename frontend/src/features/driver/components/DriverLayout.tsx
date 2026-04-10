import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Wallet, FileText, User, Bell, MessageCircle } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/driver/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/driver/withdrawals',   icon: Wallet,          label: 'Retiradas' },
  { to: '/driver/documents',     icon: FileText,        label: 'Documentos' },
  { to: '/driver/profile',       icon: User,            label: 'Perfil' },
  { to: '/driver/notifications', icon: Bell,            label: 'Notificações' },
  { to: '/driver/support',       icon: MessageCircle,   label: 'Suporte' },
] as const;

export function DriverLayout() {
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