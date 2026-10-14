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
import { useQuery } from '@tanstack/react-query';
import { Building2, Package, Inbox, PhoneCall, Coins } from 'lucide-react';
import { AppShell, type NavGroup } from '@/app/components/AppShell';
import { useAuth } from '@/features/auth/context/AuthContext';
import { queryKeys } from '@/shared/lib/query-keys';
import { systemService } from '@/features/system/services/system.service';

export function SystemLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Os pedidos por responder, para o número no menu. A mesma chave da tela do
  // painel, por isso não acrescenta um pedido — o React Query serve as duas
  // da mesma cache.
  const painelQ = useQuery({
    queryKey: queryKeys.sistema.painel,
    queryFn: () => systemService.painel(),
    enabled: !!user?.isOwner,
    staleTime: 60_000,
  });
  const porResponder = painelQ.data?.resumo.pedidos ?? 0;
  const contactosNovos = painelQ.data?.resumo.contactos ?? 0;

  const navGroups: readonly NavGroup[] = [
    {
      items: [
        { to: '/app/sistema/frotas', icon: Building2, label: 'Frotas' },
        { to: '/app/sistema/planos', icon: Package, label: 'Planos' },
        {
          to: '/app/sistema/pedidos', icon: Inbox, label: 'Pedidos',
          // Laranja: está à espera de ti, e isso é normal — não está atrasado.
          ...(porResponder > 0
            ? { badge: porResponder, badgeTone: 'waiting' as const }
            : {}),
        },
        {
          to: '/app/sistema/contactos', icon: PhoneCall, label: 'Contactos',
          // Vermelho, ao contrário dos pedidos: um contacto do site é alguém
          // que ainda não é cliente de ninguém e está à procura. Cada dia que
          // passa é um dia em que pode ligar a outra frota.
          ...(contactosNovos > 0
            ? { badge: contactosNovos, badgeTone: 'late' as const }
            : {}),
        },
        // ── Finanças pessoais ──
        //
        // Sem contador: não é trabalho à espera, é uma lista que se consulta
        // de meses a meses. Um número aqui competia com os contactos do site,
        // que são os que não podem ficar à espera.
        { to: '/app/sistema/pessoais', icon: Coins, label: 'Finanças pessoais' },
      ],
    },
  ];

  // Enquanto o /auth/me não respondeu ainda não se sabe quem é. Mandá-lo
  // embora agora era pôr o dono fora do painel dele a cada recarregamento da
  // página.
  if (loading) return null;

  if (!user?.isOwner) return <Navigate to="/app/admin" replace />;

  return (
    <AppShell
      navGroups={navGroups}
      area="Painel da Plataforma"
      switchLabel="Voltar à minha frota"
      onSwitch={() => navigate('/app/admin')}
    />
  );
}
