import type { ComponentType } from 'react';
import { TrendUp, TrendDown, type IconProps } from '@phosphor-icons/react';
import { cn } from '../../lib/cn';

interface KpiCardProps {
  icon?: ComponentType<IconProps>;
  iconBg?: string;
  label: string;
  value: string | number;
  badge?: string;
  badgeColor?: string;
  trend?: 'up' | 'down';
  hint?: string;
  className?: string;
}

export function KpiCard({
  icon: Icon,
  iconBg = 'bg-primary/10 text-primary',
  label,
  value,
  badge,
  badgeColor = 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
  trend = 'up',
  hint,
  className,
}: KpiCardProps) {
  const TrendIcon = trend === 'up' ? TrendUp : TrendDown;
  const showBadge = badge && badge !== '--';
  return (
    <div
      className={cn(
        'bg-card p-6 rounded-3xl border border-border shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] hover:shadow-md transition-shadow',
        className,
      )}
    >
      <div className="flex items-center justify-between mb-4">
        {Icon && (
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', iconBg)}>
            <Icon size={20} weight="duotone" />
          </div>
        )}
        {showBadge && (
          <span
            className={cn(
              'text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1',
              badgeColor,
            )}
          >
            <TrendIcon size={12} weight="bold" />
            {badge}
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">{label}</p>
      <h3 className="text-3xl font-extrabold mt-1 tracking-tight tabular-nums">{value}</h3>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
