// Autocompletado de reserva/huesped para el dialog rapido.
// Busca por codigo de reserva, numero de habitacion, cedula, telefono, nombre.

import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlass, Bed, User, X } from '@phosphor-icons/react';
import { lookupQuick, type QuickLookupItem } from '../api/payments.api';
import { cn } from '../../../shared/lib/cn';

export interface SelectedTarget {
  kind: 'booking' | 'customer';
  booking_id: number | null;
  customer_id: number | null;
  label: string;
  hint: string;
  importe_pendiente: number;
  moneda: string | null;
}

interface Props {
  value: SelectedTarget | null;
  onChange: (v: SelectedTarget | null) => void;
}

export function TargetLookup({ value, onChange }: Props) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<QuickLookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await lookupQuick(trimmed);
        if (!cancelled) {
          setItems(res);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, value]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  if (value) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
        {value.kind === 'booking' ? <Bed size={18} weight="duotone" className="mt-0.5 text-primary" /> : <User size={18} weight="duotone" className="mt-0.5 text-primary" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{value.label}</p>
          <p className="text-xs text-muted-foreground truncate">{value.hint}</p>
        </div>
        <button
          type="button"
          onClick={() => { onChange(null); setQ(''); }}
          className="p-1 rounded hover:bg-muted text-muted-foreground"
          aria-label="Quitar seleccion"
        >
          <X size={14} weight="bold" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar reserva, habitacion, cedula o nombre…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoComplete="off"
        />
      </div>
      {open && (loading || items.length > 0) && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {loading && (
            <p className="p-3 text-xs text-muted-foreground text-center">Buscando…</p>
          )}
          {!loading && items.map((it) => (
            <button
              key={`${it.kind}-${it.id}`}
              type="button"
              onClick={() => {
                onChange({
                  kind: it.kind,
                  booking_id: it.booking_id,
                  customer_id: it.customer_id,
                  label: it.label,
                  hint: it.hint,
                  importe_pendiente: it.importe_pendiente,
                  moneda: it.moneda,
                });
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent transition-colors',
                'border-b border-border last:border-0',
              )}
            >
              {it.kind === 'booking' ? <Bed size={14} weight="duotone" className="mt-0.5 text-primary" /> : <User size={14} weight="duotone" className="mt-0.5 text-muted-foreground" />}
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{it.label}</p>
                <p className="text-[11px] text-muted-foreground truncate">{it.hint}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
