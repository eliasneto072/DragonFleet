// src/features/system/components/SystemLayout.tsx
//
// A moldura do painel da plataforma: as frotas clientes e os planos.
//
// ─── PORQUE É QUE ESTE MENU NÃO TEM PERMISSÕES ──────────────────────────────
//
// Porque as permissões por área são as do painel de UMA frota, e isto não é
// uma área de nenhuma frota. Aqui a condição é uma só e não tem níveis: ou é o
// dono da plataforma, ou não entra.
//
// A guarda a sério está no servidor (`dono.middleware.ts`), que lê a marca da
// base de dados a cada pedido. Isto é só para a interface não desenhar um menu
// que responderia 403 em todas as entradas.

import { Navigate, useNavigate } from 'react-router-dom';
import { Building2, Package } from 'lucide-react';
import { AppShell, type NavGroup } from '@/app/components/AppShell';
import { useAuth } from '@/features/auth/context/AuthContext';

const NAV_GROUPS: readonly NavGroup[] = [
  {
    items: [
      { to: '/app/sistema/frotas', icon: Building2, label: 'Frotas' },
      { to: '/app/sistema/planos', icon: Package, label: 'Planos' },
    ],
  },
];

export function SystemLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Enquanto o /auth/me não respondeu ainda não se sabe quem é. Mandá-lo
  // embora agora era pôr o dono fora do painel dele a cada recarregamento da
  // página.
  if (loading) return null;

  if (!user?.isOwner) return <Navigate to="/app/admin" replace />;

  return (
    <AppShell
      navGroups={NAV_GROUPS}
      area="Painel da Plataforma"
      switchLabel="Voltar à minha frota"
      onSwitch={() => navigate('/app/admin')}
    />
  );
}
