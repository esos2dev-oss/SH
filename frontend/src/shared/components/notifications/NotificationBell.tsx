// Campanita de notificaciones con polling cada 30s.
// Bandeja persistente con alertas por severidad.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellRinging, ArrowSquareOut } from '@phosphor-icons/react';
import { cn } from '../../lib/cn';

const POLL_MS = 30_000;

export type NotificationSeverity = 'info' | 'warning' | 'error';

export interface Notification {
  kind: string;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  url: string;
  entity_id: number;
  created_at: string;
}

interface ActivePayload {
  count: number;
  bySeverity: { error: number; warning: number; info: number };
  items: Notification[];
  generated_at: string;
}

const SEVERITY_STYLE: Record<NotificationSeverity, { dot: string; bg: string; text: string }> = {
  error: { dot: 'bg-red-500', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300' },
  warning: { dot: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300' },
  info: { dot: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300' },
};

export function NotificationBell() {
  const [data, setData] = useState<ActivePayload | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    // Notificaciones aun no implementadas en Supabase. Stub vacio para no romper UI.
    setLoading(false);
    setData({ count: 0, bySeverity: { error: 0, warning: 0, info: 0 }, items: [], generated_at: new Date().toISOString() });
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, []);

  const count = data?.count ?? 0;
  const hasErrors = (data?.bySeverity.error ?? 0) > 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative h-9 w-9 rounded-lg border border-border bg-card hover:bg-muted flex items-center justify-center"
        title="Notificaciones"
      >
        {hasErrors ? <BellRinging size={16} weight="duotone" className="text-red-600 dark:text-red-400" /> : <Bell size={16} weight={count > 0 ? 'duotone' : 'regular'} />}
        {count > 0 && (
          <span className={cn(
            'absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center',
            hasErrors ? 'bg-red-600 text-white' : 'bg-amber-500 text-white',
          )}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-h-[70vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-2xl z-50">
          <div className="px-4 py-2 border-b border-border bg-muted/30 sticky top-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Notificaciones</h3>
              <span className="text-[10px] text-muted-foreground">{loading ? 'Actualizando…' : `${count} activas`}</span>
            </div>
            {data && (
              <div className="flex items-center gap-3 mt-1 text-[10px]">
                {data.bySeverity.error > 0 && <span className="text-red-600 dark:text-red-400 font-bold">{data.bySeverity.error} criticas</span>}
                {data.bySeverity.warning > 0 && <span className="text-amber-600 dark:text-amber-400 font-bold">{data.bySeverity.warning} alertas</span>}
                {data.bySeverity.info > 0 && <span className="text-blue-600 dark:text-blue-400 font-bold">{data.bySeverity.info} info</span>}
              </div>
            )}
          </div>

          {!data || data.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">Sin alertas activas. Todo en orden.</p>
          ) : (
            <div>
              {data.items.map((n) => {
                const style = SEVERITY_STYLE[n.severity];
                return (
                  <Link
                    key={`${n.kind}-${n.entity_id}`}
                    to={n.url}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-muted/50 border-b border-border/40 last:border-0 transition-colors"
                  >
                    <span className={cn('mt-1.5 w-2 h-2 rounded-full flex-shrink-0', style.dot)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{n.title}</p>
                      <p className={cn('text-[11px] truncate', 'text-muted-foreground')}>{n.detail}</p>
                    </div>
                    <ArrowSquareOut size={10} className="mt-1 text-muted-foreground flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
