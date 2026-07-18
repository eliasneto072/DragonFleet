// src/app/components/ui/page-header.tsx
//
// Consistent page header used on every screen in the app shell.
// Title + optional subtitle on the left, optional action(s) on the right.

import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="h-10 w-10 rounded-lg bg-brand-50 text-accent flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-foreground leading-tight">{title}</h1>
          {subtitle && <p className="text-muted-foreground text-sm mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
