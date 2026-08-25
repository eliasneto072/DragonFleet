// src/features/admin/components/AdminLayout.tsx

import { Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, DollarSign, Car, TrendingUp,
  Settings, FileText, MessageCircle, Bell, ReceiptText, FileSpreadsheet,
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
  // Logo a seguir ao Financeiro porque é a mesma tarefa vista de outro ângulo:
  // ali decide-se e classifica-se, aqui consulta-se o que ficou registado.
  { to: '/app/admin/green-receipts', icon: FileSpreadsheet, label: 'Recibos Verdes' },
  { to: '/app/admin/fleet',         icon: Car,             label: 'Frotas'        },
  { to: '/app/admin/analytics',     icon: TrendingUp,      label: 'Análises'      },
  { to: '/app/admin/notifications', icon: Bell,            label: 'Notificações'  },
  { to: '/app/admin/support',       icon: MessageCircle,   label: 'Suporte'       },
  { to: '/app/admin/settings',      icon: Settings,        label: 'Configurações' },
];

export function AdminLayout() {
  const { user } = useAuth();

  if (user?.role === 'DRIVER') {
    return <Navigate to="/app/driver" replace />;
  }

  return (
    // Sem "Ver como Motorista": o botão levava o administrador ao painel do
    // motorista com o próprio id, mostrando dados vazios em vez dos de alguém.
    // A ficha do motorista já reúne saldo, documentos, retiradas, veículos e
    // histórico — que era o que se procurava ali.
    //
    // O caminho inverso, em DriverLayout, fica: um administrador que chegue ao
    // painel do motorista precisa de voltar.
    <AppShell
      navItems={NAV_ITEMS}
      area="Painel Administrativo"
    />
  );
}
