// src/app/components/AppShell.tsx
//
// Unified application shell (light, fintech style).
//  - Fixed sidebar on desktop (>= lg)
//  - Slide-over drawer on mobile, toggled by a top bar
//  - Brand header, nav items, user footer with logout / role switch
//
// Both DriverLayout and AdminLayout render <AppShell> with their own nav items.
//
// FOTOGRAFIA NO RODAPÉ: vem do documento FOTO_PERFIL, a mesma fonte usada na
// tela de Perfil — o motorista já enviou a imagem e não faz sentido pedi-la
// outra vez. As iniciais ficam como recurso quando não há foto, quando ela foi
// rejeitada ou enquanto o pedido não termina.
//
// O carregamento vive aqui, e não dentro de userFooter, porque esse bloco é
// renderizado duas vezes (barra lateral e gaveta): colocá-lo lá dentro faria
// dois pedidos do mesmo ficheiro.
//
// A consulta só corre para motoristas. Este shell também serve o portal de
// administração, onde FOTO_PERFIL não existe — sem a guarda seria um pedido
// desperdiçado em cada página. A chave de consulta é a mesma das telas de
// Documentos e Veículos, por isso o React Query reaproveita a cache em vez de
// repetir a chamada.

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Menu, X, ArrowLeftRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Toaster } from '@/app/components/ui/sonner';
import { DragonFleetLogo } from '@/app/components/DragonFleetLogo';
import { ThemeToggle } from '@/app/components/ui/theme-toggle';
import { useAuth } from '@/features/auth/context/AuthContext';
import { documentsService } from '@/features/driver/services/documents.service';
import { queryKeys } from '@/shared/lib/query-keys';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Número a assinalar no item; 0 ou ausente não mostra nada. */
  badge?: number;
  /** Vermelho em vez de neutro — algo que exige ação, não só novidade. */
  badgeUrgent?: boolean;
}

export interface NavGroup {
  /** Sem título, o grupo aparece sem cabeçalho. */
  title?: string;
  items: readonly NavItem[];
}

interface AppShellProps {
  /** Lista simples; usar `navGroups` quando houver secções. */
  navItems?: readonly NavItem[];
  navGroups?: readonly NavGroup[];
  /** Shown under the logo, e.g. "Portal do Motorista". */
  area: string;
  /** Label for the role-switch button, or null to hide it. */
  switchLabel?: string | null;
  onSwitch?: () => void;
}

export function AppShell({
  navItems, navGroups, area, switchLabel, onSwitch,
}: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const groups: readonly NavGroup[] = navGroups ?? [{ items: navItems ?? [] }];
  const allItems = groups.flatMap((g) => g.items);

  // Fecha a gaveta ao navegar. Sem isto ela ficava aberta por cima da tela
  // nova, e era preciso um segundo toque para a ver.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const isDriver = user?.role === 'DRIVER';

  const { data: docsData } = useQuery({
    queryKey: queryKeys.documents.list,
    queryFn: () => documentsService.list(),
    enabled: isDriver,
    staleTime: 5 * 60 * 1000,
  });

  const photoDoc = docsData?.documents.find(
    (d) => d.type === 'FOTO_PERFIL' && !d.vehicleId,
  );
  // Visível assim que enviada, tal como no Perfil. Rejeitada ou expirada
  // volta às iniciais.
  const photoVisible =
    !!photoDoc && (photoDoc.status === 'APPROVED' || photoDoc.status === 'PENDING');

  useEffect(() => {
    if (!photoVisible || !photoDoc) {
      setPhotoUrl(null);
      return;
    }

    // `revoked` cobre o caso de o pedido terminar depois de o componente sair:
    // sem isso o object URL ficaria retido em memória sem ninguém para o
    // libertar.
    let revoked = false;
    let url: string | null = null;

    documentsService
      .getFileObjectUrl(photoDoc.id)
      .then((objectUrl) => {
        if (revoked) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        url = objectUrl;
        setPhotoUrl(objectUrl);
      })
      .catch(() => setPhotoUrl(null));

    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoDoc?.id, photoVisible]);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const initials = user?.name
    ? user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : '–';

  function Badge({ value, urgent }: { value: number; urgent?: boolean }) {
    return (
      <span
        className={`ml-auto inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
          urgent
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-secondary text-muted-foreground'
        }`}
      >
        {value > 99 ? '99+' : value}
      </span>
    );
  }

  const navContent = (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label={area}>
      {groups.map((group, gi) => (
        <div key={group.title ?? gi} className="space-y-1">
          {group.title && (
            <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
          )}
          {group.items.map(({ to, icon: Icon, label, badge, badgeUrgent }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-accent dark:bg-emerald-950 dark:text-emerald-300'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                ].join(' ')
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
              {!!badge && badge > 0 && <Badge value={badge} urgent={badgeUrgent} />}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );

  const userFooter = (
    <div className="border-t border-border p-3 space-y-2">
      {switchLabel && onSwitch && (
        <button
          onClick={() => { onSwitch(); setDrawerOpen(false); }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <ArrowLeftRight className="h-4 w-4 shrink-0" />
          {switchLabel}
        </button>
      )}
      <div className="flex items-center gap-3 px-2 py-1.5">
        {photoUrl ? (
          // alt vazio: o nome está ao lado, um rótulo aqui seria redundante
          // para quem usa leitor de ecrã.
          <img
            src={photoUrl}
            alt=""
            className="h-9 w-9 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="h-9 w-9 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
        <ThemeToggle />
        <button
          onClick={handleLogout}
          title="Sair"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-destructive transition-colors shrink-0"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  /** Título da tela atual, para o cabeçalho do telemóvel. */
  const currentLabel =
    allItems.find((i) => location.pathname.startsWith(i.to))?.label ?? area;

  /** Total de pendências, para assinalar o botão do menu no telemóvel. */
  const totalBadge = allItems.reduce((sum, i) => sum + (i.badge ?? 0), 0);
  const anyUrgent = allItems.some((i) => i.badgeUrgent && (i.badge ?? 0) > 0);

  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-card border-r border-border flex-col z-40">
        <div className="h-16 flex items-center px-5 border-b border-border">
          <DragonFleetLogo size={36} />
        </div>
        <div className="px-5 py-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{area}</span>
        </div>
        {navContent}
        {userFooter}
      </aside>

      {/* ── Mobile top bar ──
          Mostra a tela atual, e não só o logo: num telemóvel a barra lateral
          está fechada, e sem isto nada indica onde se está. */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <DragonFleetLogo size={30} iconOnly />
          <span className="truncate text-sm font-semibold">{currentLabel}</span>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-secondary"
          aria-label={totalBadge > 0 ? `Abrir menu, ${totalBadge} pendências` : 'Abrir menu'}
        >
          <Menu className="h-5 w-5" />
          {totalBadge > 0 && (
            <span
              className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${
                anyUrgent ? 'bg-destructive' : 'bg-brand-500'
              }`}
              aria-hidden="true"
            />
          )}
        </button>
      </header>

      {/* ── Mobile drawer ── */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-card flex flex-col shadow-xl">
            <div className="h-14 flex items-center justify-between px-4 border-b border-border">
              <DragonFleetLogo size={32} />
              <button
                onClick={() => setDrawerOpen(false)}
                className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{area}</span>
            </div>
            {navContent}
            {userFooter}
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="lg:pl-64">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}