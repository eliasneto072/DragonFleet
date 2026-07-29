// src/features/admin/components/AdminLayout.tsx

import { Navigate, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, DollarSign, Car, TrendingUp,
  Settings, FileText, MessageCircle, Bell, ReceiptText,
} from 'lucide-react';
import { AppShell, type NavItem } from '@/app/components/AppShell';
import { useAuth } from '@/features/auth/context/AuthContext';

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/app/admin/dashboard',     icon: LayoutDashboard, label: 'Dashboard'     },
  { to: '/app/admin/drivers',       icon: Users,           label: 'Motoristas'    },
  { to: '/app/admin/documents',     icon: FileText,        label: 'Documentos'    },
  // Rótulo curto de propósito: a barra lateral tem cerca de 200px úteis e
  // "Registo semanal de faturação" quebraria em três linhas. O nome completo
  // é o título da página.
  { to: '/app/admin/settlements',   icon: ReceiptText,     label: 'Faturação'     },
  { to: '/app/admin/financial',     icon: DollarSign,      label: 'Financeiro'    },
  { to: '/app/admin/fleet',         icon: Car,             label: 'Frotas'        },
  { to: '/app/admin/analytics',     icon: TrendingUp,      label: 'Análises'      },
  { to: '/app/admin/notifications', icon: Bell,            label: 'Notificações'  },
  { to: '/app/admin/support',       icon: MessageCircle,   label: 'Suporte'       },
  { to: '/app/admin/settings',      icon: Settings,        label: 'Configurações' },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user?.role === 'DRIVER') {
    return <Navigate to="/app/driver" replace />;
  }

  return (
    <AppShell
      navItems={NAV_ITEMS}
      area="Painel Administrativo"
      switchLabel="Ver como Motorista"
      onSwitch={() => navigate('/app/driver')}
    />
  );
}
