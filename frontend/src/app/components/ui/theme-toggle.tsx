// src/app/components/ui/theme-toggle.tsx
//
// Small sun/moon toggle. Drop it in the sidebar footer or top bar.

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/features/theme/ThemeProvider';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolvedTheme, toggle } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      className={[
        'h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors',
        className,
      ].join(' ')}
    >
      {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}
