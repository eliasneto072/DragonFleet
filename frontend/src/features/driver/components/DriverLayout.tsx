// src/features/driver/components/DriverLayout.tsx
//
// Menu do motorista, agrupado e com contadores.
//
// AGRUPAMENTO: sete itens numa lista plana davam o mesmo peso a "Retiradas",
// que se usa todas as semanas, e a "Suporte", que se abre uma vez por mês. As
// secções dão hierarquia sem esconder nada — tudo continua a um toque.
//
// CONTADORES: o que exige ação aparece no menu. Antes, um documento rejeitado
// só se descobria entrando em Documentos, e o motorista podia passar dias sem
// saber que estava a impedir a própria ativação. Documentos e Veículos usam o
// tom de alerta; Notificações fica em neutro, porque é novidade e não pendência.

import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Wallet, FileText, User, Bell, MessageCircle, Car,
} from 'lucide-react';
import { AppShell, type NavGroup } from '@/app/components/AppShell';
import { useAuth } from '@/features/auth/context/AuthContext';
import { documentsService } from '@/features/driver/services/documents.service';
import { notificationsService } from '@/features/driver/services/notifications.service';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { queryKeys } from '@/shared/lib/query-keys';

export function DriverLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Admins/managers can preview the driver portal; drivers can't switch.
  const canSwitch = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  // As três consultas alimentam também as telas de destino: o React Query
  // partilha a cache pela chave, por isso isto não acrescenta pedidos — o
  // primeiro a montar busca, os outros reutilizam.
  const docsQ = useQuery({
    queryKey: queryKeys.documents.list,
    queryFn: () => documentsService.list(),
    enabled: !!user?.id,
  });

  const notifsQ = useQuery({
    queryKey: queryKeys.notifications.list,
    queryFn: () => notificationsService.list(),
    enabled: !!user?.id,
  });

  const vehiclesQ = useQuery({
    queryKey: queryKeys.vehicles.list,
    queryFn: () => vehiclesService.list(),
    enabled: !!user?.id,
  });

  const documents = docsQ.data?.documents ?? [];
  const myDocs = documents.filter((d) => d.userId === user?.id);

  // Rejeitado e expirado exigem novo envio; pendente não pede nada ao
  // motorista, e assinalá-lo seria um número que ele não consegue baixar.
  const docsNeedingAction = myDocs.filter(
    (d) => !d.vehicleId && (d.status === 'REJECTED' || d.status === 'EXPIRED'),
  ).length;

  const vehicleDocsNeedingAction = myDocs.filter(
    (d) => d.vehicleId && (d.status === 'REJECTED' || d.status === 'EXPIRED'),
  ).length;

  // Veículo por ativar conta como pendência: sem isso ele não pode trabalhar.
  const pendingVehicles = (vehiclesQ.data?.vehicles ?? []).filter(
    (v) => v.userId === user?.id && v.status === 'PENDING',
  ).length;

  const unreadNotifs = (notifsQ.data?.notifications ?? []).filter(
    (n) => n.userId === user?.id && !n.read,
  ).length;

  const NAV_GROUPS: readonly NavGroup[] = [
    {
      items: [
        { to: '/app/driver/dashboard', icon: LayoutDashboard, label: 'Início' },
        { to: '/app/driver/withdrawals', icon: Wallet, label: 'Retiradas' },
      ],
    },
    {
      title: 'A minha conta',
      items: [
        {
          to: '/app/driver/documents',
          icon: FileText,
          label: 'Documentos',
          badge: docsNeedingAction,
          badgeUrgent: true,
        },
        {
          to: '/app/driver/vehicles',
          icon: Car,
          label: 'Veículos',
          badge: vehicleDocsNeedingAction + pendingVehicles,
          badgeUrgent: vehicleDocsNeedingAction > 0,
        },
        { to: '/app/driver/profile', icon: User, label: 'Perfil' },
      ],
    },
    {
      title: 'Comunicação',
      items: [
        {
          to: '/app/driver/notifications',
          icon: Bell,
          label: 'Notificações',
          badge: unreadNotifs,
        },
        { to: '/app/driver/support', icon: MessageCircle, label: 'Suporte' },
      ],
    },
  ];

  return (
    <AppShell
      navGroups={NAV_GROUPS}
      area="Portal do Motorista"
      switchLabel={canSwitch ? 'Ver como Admin' : null}
      onSwitch={canSwitch ? () => navigate('/app/admin') : undefined}
    />
  );
}
