// src/features/invest/components/InvestLayout.tsx
//
// A moldura do portal: barra em cima, navegação, conteúdo.
//
// ─── BARRA EM CIMA E NÃO BARRA LATERAL ──────────────────────────────────────
//
// O portal da frota tem menu lateral porque tem dezassete telas. Este tem
// quatro. Uma barra lateral com quatro entradas gasta um quinto da largura do
// ecrã para não dizer quase nada, e faz o site parecer maior do que é —
// enquanto uma barra fina em cima deixa o conteúdo respirar, que é metade do
// efeito que se procura aqui.
//
// Em telemóvel a navegação passa para baixo, ao alcance do polegar.

import { Outlet, NavLink, Navigate, useLocation } from 'react-router-dom';
import { LayoutGrid, Car, Receipt, ArrowUpFromLine, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { InvestWordmark, InvestMark } from './InvestBrand';

const SECCOES: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/painel', label: 'Painel', icon: LayoutGrid },
  { to: '/projetos', label: 'Projetos', icon: Car },
  { to: '/extrato', label: 'Extrato', icon: Receipt },
  { to: '/resgates', label: 'Resgates', icon: ArrowUpFromLine },
  { to: '/conta', label: 'Conta', icon: UserRound },
];

export function InvestLayout() {
  const { isAuthenticated, loading, user } = useAuth();
  const { pathname } = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <InvestMark size={48} className="animate-pulse" />
      </div>
    );
  }

  // A sessão da frota e a do investidor partilham o mesmo token no browser.
  // Quem entrou em dragonfleet.pt e abrir este endereço chega aqui autenticado
  // — e vai parar ao ecrã de entrada, que lhe explica porquê.
  if (!isAuthenticated || user?.role !== 'INVESTOR') {
    return <Navigate to="/entrar" replace state={{ from: pathname }} />;
  }

  return (
    <div className="min-h-screen">
      {/* ── Barra ────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-xl"
        style={{
          borderColor: 'var(--border)',
          background: 'rgba(7, 8, 10, 0.78)',
        }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-5 py-4">
          <InvestWordmark size="sm" />

          <nav className="hidden gap-1 sm:flex" aria-label="Navegação principal">
            {SECCOES.map((s) => <Aba key={s.to} {...s} />)}
          </nav>

          <p className="hidden text-xs text-[var(--muted-foreground)] lg:block">
            {user?.name}
          </p>
        </div>
      </header>

      {/* ── Conteúdo ─────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-5xl px-5 pb-28 pt-8 sm:pb-16">
        <Outlet />
      </main>

      {/* ── Navegação em telemóvel ───────────────────────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-xl sm:hidden"
        style={{ borderColor: 'var(--border)', background: 'rgba(7, 8, 10, 0.92)' }}
        aria-label="Navegação principal"
      >
        <div className="flex">
          {SECCOES.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-3 text-[10px] tracking-wide transition-colors ${
                  isActive ? 'text-[var(--gold-300)]' : 'text-[var(--muted-foreground)]'
                }`
              }
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <footer className="hidden border-t px-5 py-6 sm:block" style={{ borderColor: 'var(--border)' }}>
        <p className="mx-auto max-w-5xl text-[11px] text-[var(--muted-foreground)]">
          Chromatic Dragon Unipessoal Lda · DragonFleet Capital
        </p>
      </footer>
    </div>
  );
}

function Aba({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-md px-3.5 py-2 text-sm transition-colors ${
          isActive
            ? 'bg-[rgba(201,162,39,0.10)] text-[var(--gold-200)]'
            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
        }`
      }
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </NavLink>
  );
}
