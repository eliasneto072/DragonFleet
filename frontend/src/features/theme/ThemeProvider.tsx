// src/features/theme/ThemeProvider.tsx
//
// Light/dark theme with persistence. Adds/removes the `dark` class on <html>,
// which is what the design tokens in theme.css key off of.
//
// Usage:
//   <ThemeProvider> wraps the app (in main.tsx)
//   const { theme, setTheme } = useTheme()  // 'light' | 'dark' | 'system'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isInvestPortal } from '@/shared/config/portal';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'dragonfleet-theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  // O portal do investidor é sempre escuro. Não é preferência, é a identidade
  // do site: em claro, o ouro sobre branco fica amarelo-mostarda e todo o
  // efeito se perde. Aqui o tema do sistema não manda — e a tela de definições
  // que deixa escolher só existe do lado da frota.
  if (isInvestPortal || resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'system';
  });

  const resolvedTheme: 'light' | 'dark' = isInvestPortal
    ? 'dark'
    : (theme === 'system' ? getSystemTheme() : theme);

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // React to OS theme changes while in "system" mode
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(getSystemTheme());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  function setTheme(t: Theme) {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  }

  function toggle() {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
