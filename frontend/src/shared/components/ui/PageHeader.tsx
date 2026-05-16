import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, breadcrumbs, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-4', className)}>
      <div className="min-w-0">
        {breadcrumbs && <div className="mb-1">{breadcrumbs}</div>}
        <h1 className="text-2xl font-semibold tracking-tight truncate">{title}</h1>
        {subtitle && (
          <p className="text-muted-foreground text-sm mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
