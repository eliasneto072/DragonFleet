// src/app/components/AppShell.tsx
//
// Unified application shell (light, fintech style).
//  - Fixed sidebar on desktop (>= lg)
//  - Slide-over drawer on mobile, toggled by a top bar
//  - Brand header, nav items, user footer with logout / role switch
//
// Both DriverLayout and AdminLayout render <AppShell> with their own nav items.

import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X, ArrowLeftRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Toaster } from '@/app/components/ui/sonner';
import { DragonFleetLogo } from '@/app/components/DragonFleetLogo';
import { ThemeToggle } from '@/app/components/ui/theme-toggle';
import { useAuth } from '@/features/auth/context/AuthContext';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
}

interface AppShellProps {
  navItems: readonly NavItem[];
  /** Shown under the logo, e.g. "Portal do Motorista". */
  area: string;
  /** Label for the role-switch button, or null to hide it. */
  switchLabel?: string | null;
  onSwitch?: () => void;
}

export function AppShell({ navItems, area, switchLabel, onSwitch }: AppShellProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const initials = user?.name
    ? user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : '–';

  const navContent = (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label={area}>
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => setDrawerOpen(false)}
          className={({ isActive }) =>
            [
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-50 text-accent'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            ].join(' ')
          }
        >
          <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span>{label}</span>
        </NavLink>
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
        <div className="h-9 w-9 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
          {initials}
        </div>
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

      {/* ── Mobile top bar ── */}
      <header className="lg:hidden sticky top-0 z-30 h-14 bg-card border-b border-border flex items-center justify-between px-4">
        <DragonFleetLogo size={32} />
        <button
          onClick={() => setDrawerOpen(true)}
          className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
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
