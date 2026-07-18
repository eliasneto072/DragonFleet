// src/features/driver/components/DriverLayout.tsx

import { Navigate, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Wallet, FileText, User, Bell, MessageCircle, Car } from 'lucide-react';
import { AppShell, type NavItem } from '@/app/components/AppShell';
import { useAuth } from '@/features/auth/context/AuthContext';

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/app/driver/dashboard',     icon: LayoutDashboard, label: 'Dashboard'    },
  { to: '/app/driver/withdrawals',   icon: Wallet,          label: 'Retiradas'    },
  { to: '/app/driver/documents',     icon: FileText,        label: 'Documentos'   },
  { to: '/app/driver/vehicles',      icon: Car,             label: 'Veículos'     },
  { to: '/app/driver/profile',       icon: User,            label: 'Perfil'       },
  { to: '/app/driver/notifications', icon: Bell,            label: 'Notificações' },
  { to: '/app/driver/support',       icon: MessageCircle,   label: 'Suporte'      },
];

export function DriverLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Admins/managers can preview the driver portal; drivers can't switch.
  const canSwitch = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  return (
    <AppShell
      navItems={NAV_ITEMS}
      area="Portal do Motorista"
      switchLabel={canSwitch ? 'Ver como Admin' : null}
      onSwitch={canSwitch ? () => navigate('/app/admin') : undefined}
    />
  );
}
