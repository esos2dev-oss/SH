// Command palette global. Atajos: Ctrl+K / Cmd+K para abrir.
// Busca habitaciones, reservas, huespedes, pagos y acciones predefinidas.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MagnifyingGlass, Bed, CalendarBlank, UserCircle, CurrencyCircleDollar,
  Plus, ClipboardText, ArrowRight,
} from '@phosphor-icons/react';
import { api } from '../../api/client';
import { cn } from '../../lib/cn';
import { useQuickPayment } from '../../../modules/payments/hooks/QuickPaymentProvider';

export interface SearchHit {
  kind: 'room' | 'booking' | 'customer' | 'payment';
  id: number;
  label: string;
  hint: string;
  url: string;
}

interface Command {
  kind: 'action';
  id: string;
  label: string;
  hint: string;
  action: () => void;
  icon: React.ReactNode;
  keywords: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const quickPay = useQuickPayment();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    { kind: 'action', id: 'new-booking', label: 'Nueva reserva', hint: 'Tecla N', icon: <Plus size={14} />, keywords: ['nueva', 'reserva', 'crear'], action: () => navigate('/bookings?new=1') },
    { kind: 'action', id: 'new-payment', label: 'Registrar pago', hint: 'Tecla P', icon: <CurrencyCircleDollar size={14} />, keywords: ['pago', 'cobrar', 'pagar'], action: () => quickPay.open() },
    { kind: 'action', id: 'goto-timeline', label: 'Ver timeline de ocupacion', hint: '', icon: <CalendarBlank size={14} />, keywords: ['timeline', 'ocupacion', 'gantt'], action: () => navigate('/bookings/timeline') },
    { kind: 'action', id: 'goto-cleaning', label: 'Vista de limpieza', hint: '', icon: <ClipboardText size={14} />, keywords: ['limpieza', 'housekeeping'], action: () => navigate('/cleaning') },
    { kind: 'action', id: 'goto-cash-closure', label: 'Cierre de caja', hint: '', icon: <CurrencyCircleDollar size={14} />, keywords: ['cierre', 'caja', 'turno'], action: () => navigate('/payments/cash-closure') },
    { kind: 'action', id: 'goto-payments', label: 'Lista de pagos', hint: '', icon: <CurrencyCircleDollar size={14} />, keywords: ['pagos'], action: () => navigate('/payments') },
    { kind: 'action', id: 'goto-customers', label: 'Huespedes', hint: '', icon: <UserCircle size={14} />, keywords: ['huespedes', 'clientes'], action: () => navigate('/customers') },
    { kind: 'action', id: 'goto-rooms', label: 'Habitaciones', hint: '', icon: <Bed size={14} />, keywords: ['habitaciones', 'rooms'], action: () => navigate('/rooms') },
  ];

  // Buscar (debounced)
  useEffect(() => {
    if (!open) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setHits([]);
      return;
    }
    let cancel = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get<SearchHit[]>('/api/search', { query: { q: trimmed, limit: 20 } });
        if (!cancel) setHits(r);
      } catch {
        if (!cancel) setHits([]);
      } finally {
        if (!cancel) setLoading(false);
      }
    }, 180);
    return () => { cancel = true; clearTimeout(t); };
  }, [q, open]);

  useEffect(() => {
    if (open) {
      setQ('');
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Filtrado de comandos por keywords
  const filteredCommands = q.trim().length === 0
    ? commands
    : commands.filter((c) => {
        const t = q.toLowerCase();
        return c.label.toLowerCase().includes(t) || c.keywords.some((k) => k.includes(t));
      });

  const items: Array<{ kind: 'hit'; data: SearchHit } | { kind: 'command'; data: Command }> = [
    ...filteredCommands.map((c) => ({ kind: 'command' as const, data: c })),
    ...hits.map((h) => ({ kind: 'hit' as const, data: h })),
  ];

  const select = useCallback((index: number) => {
    const it = items[index];
    if (!it) return;
    if (it.kind === 'command') {
      it.data.action();
    } else {
      navigate(it.data.url);
    }
    onClose();
  }, [items, navigate, onClose]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, items.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); select(highlight); return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items.length, highlight, onClose, select]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-24 px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <MagnifyingGlass size={18} className="text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setHighlight(0); }}
            placeholder="Buscar habitacion, reserva, huesped, comando..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Esc</span>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading && hits.length === 0 && q.length >= 2 && (
            <p className="px-4 py-3 text-xs text-muted-foreground">Buscando…</p>
          )}
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              {q.trim().length < 2 ? 'Escribe al menos 2 caracteres para buscar' : 'Sin resultados'}
            </p>
          ) : (
            items.map((it, i) => (
              <ItemRow
                key={`${it.kind}-${it.kind === 'command' ? it.data.id : `${it.data.kind}-${it.data.id}`}`}
                item={it}
                highlighted={i === highlight}
                onClick={() => select(i)}
                onMouseEnter={() => setHighlight(i)}
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30 text-[10px] text-muted-foreground">
          <span>↑↓ navegar · Enter abrir</span>
          <span>{items.length} resultados</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================

function ItemRow({ item, highlighted, onClick, onMouseEnter }: {
  item: { kind: 'hit'; data: SearchHit } | { kind: 'command'; data: Command };
  highlighted: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const data = item.data;
  const icon = item.kind === 'command' ? item.data.icon : iconFor(item.data.kind);
  const tag = item.kind === 'command' ? 'Accion' : kindLabel(item.data.kind);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-border/40 last:border-0',
        highlighted ? 'bg-primary/10' : 'hover:bg-muted/50',
      )}
    >
      <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center', highlighted ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{data.label}</p>
        <p className="text-[11px] text-muted-foreground truncate">{data.hint}</p>
      </span>
      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground hidden sm:inline">{tag}</span>
      <ArrowRight size={12} className={cn('opacity-0', highlighted && 'opacity-100')} />
    </button>
  );
}

function iconFor(kind: SearchHit['kind']): React.ReactNode {
  switch (kind) {
    case 'room': return <Bed size={14} />;
    case 'booking': return <CalendarBlank size={14} />;
    case 'customer': return <UserCircle size={14} />;
    case 'payment': return <CurrencyCircleDollar size={14} />;
  }
}

function kindLabel(kind: SearchHit['kind']): string {
  switch (kind) {
    case 'room': return 'Habitacion';
    case 'booking': return 'Reserva';
    case 'customer': return 'Huesped';
    case 'payment': return 'Pago';
  }
}
