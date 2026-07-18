// src/app/providers/RootLayout.tsx
//
// Slimmed down: RootLayout now only handles auth-gating and the loading state.
// The visual chrome (sidebar, header, footer) lives in AppShell, rendered by
// DriverLayout / AdminLayout. This removes the old dark wrapper.

import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { DragonFleetLogo } from '@/app/components/DragonFleetLogo';

export function RootLayout() {
  const { pathname } = useLocation();
  const { user, isAuthenticated, loading } = useAuth();

  const isAdmin = pathname.startsWith('/app/admin');

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <DragonFleetLogo iconOnly size={56} />
          <p className="text-muted-foreground text-sm">Carregando…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isAdmin && user?.role === 'DRIVER') return <Navigate to="/app/driver" replace />;

  return <Outlet />;
}
