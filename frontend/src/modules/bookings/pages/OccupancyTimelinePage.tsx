// Timeline tipo Gantt: eje X = tiempo, eje Y = habitaciones. Bloques de color por reserva.
// Click en bloque -> detalle de reserva. Click en hueco vacio -> crear reserva precargada.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, ArrowsClockwise } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { Button } from '../../../shared/components/ui/button';
import { SelectNative } from '../../../shared/components/ui/select-native';
import { calendarBookings, moveBooking, type Booking, type BookingStatus } from '../api/bookings.api';
import { listRooms, type Room } from '../../rooms/api/rooms.api';
import { useDialog } from '../../../shared/components/ui/dialog-system';
import { cn } from '../../../shared/lib/cn';
import { formatCurrency } from '../../../shared/lib/format';

type Granularity = 'day' | 'week';

const STATUS_COLOR: Record<BookingStatus, string> = {
  pendiente: 'bg-amber-400 hover:bg-amber-500 text-amber-950',
  confirmada: 'bg-blue-500 hover:bg-blue-600 text-white',
  en_curso: 'bg-emerald-500 hover:bg-emerald-600 text-white',
  finalizada: 'bg-slate-400 hover:bg-slate-500 text-white',
  cancelada: 'bg-red-300 line-through opacity-70 text-red-950',
  no_show: 'bg-red-400 text-red-950',
};

function startOf(date: Date, granularity: Granularity): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (granularity === 'week') {
    const dow = d.getDay(); // 0=dom
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dow + 6) % 7));
    return monday;
  }
  return d;
}

function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

interface TimelineCell {
  room: Room;
  daySlots: Array<{ date: Date; bookingId: number | null }>;
}

export default function OccupancyTimelinePage() {
  const navigate = useNavigate();
  const dialog = useDialog();
  const [anchor, setAnchor] = useState<Date>(() => startOf(new Date(), 'day'));
  const [days, setDays] = useState<number>(14);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<BookingStatus | ''>('');
  const [filterPlanta, setFilterPlanta] = useState<string>('');
  const [dragInfo, setDragInfo] = useState<{ bookingId: number; sourceRoomId: number } | null>(null);

  const startDate = useMemo(() => anchor, [anchor]);
  const endDate = useMemo(() => addDays(anchor, days - 1), [anchor, days]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, b] = await Promise.all([
        listRooms({ active: true }),
        calendarBookings(formatDateOnly(startDate), formatDateOnly(addDays(endDate, 1))),
      ]);
      setRooms(r);
      setBookings(b);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setLoading(false); }
  }, [startDate, endDate]);

  useEffect(() => { void load(); }, [load]);

  async function handleDrop(bookingId: number, targetRoomId: number, sourceRoomId: number) {
    if (targetRoomId === sourceRoomId) return;
    const target = rooms.find((r) => r.id === targetRoomId);
    const booking = bookings.find((b) => b.id === bookingId);
    if (!target || !booking) return;
    const okMove = await dialog.confirm({
      title: `Mover reserva ${booking.codigo}?`,
      message: `Pasar de Hab. ${booking.room.numero} a Hab. ${target.numero}.`,
      confirmLabel: 'Mover',
    });
    if (!okMove) return;
    try {
      await moveBooking(bookingId, { room_id: targetRoomId });
      toast.success(`Reserva movida a Hab. ${target.numero}`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo mover');
    }
  }

  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => addDays(startDate, i)), [startDate, days]);

  const plantas = useMemo(() => {
    const s = new Set<string>();
    for (const r of rooms) if (r.planta) s.add(r.planta);
    return Array.from(s).sort();
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    if (!filterPlanta) return rooms;
    return rooms.filter((r) => r.planta === filterPlanta);
  }, [rooms, filterPlanta]);

  const cells: TimelineCell[] = useMemo(() => {
    return filteredRooms.map((room) => ({
      room,
      daySlots: dayList.map((day) => {
        const found = bookings.find((b) => {
          if (b.room.id !== room.id) return false;
          if (filterStatus && b.status !== filterStatus) return false;
          const fe = new Date(b.fecha_entrada);
          const fs = new Date(b.fecha_salida);
          // El dia esta dentro de [fe, fs)
          return day >= startOf(fe, 'day') && day < startOf(fs, 'day');
        });
        return { date: day, bookingId: found?.id ?? null };
      }),
    }));
  }, [filteredRooms, dayList, bookings, filterStatus]);

  function shift(deltaDays: number) {
    setAnchor((a) => addDays(a, deltaDays));
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Timeline de ocupacion"
        subtitle={`${formatDateOnly(startDate)} → ${formatDateOnly(endDate)}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => shift(-days)}><ArrowLeft size={14} /></Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(startOf(new Date(), 'day'))}>Hoy</Button>
            <Button variant="outline" size="sm" onClick={() => shift(days)}><ArrowRight size={14} /></Button>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              <ArrowsClockwise size={14} className={cn(loading && 'animate-spin')} />
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3 bg-card border border-border rounded-2xl p-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Rango</label>
          <SelectNative value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-32">
            <option value="7">7 dias</option>
            <option value="14">2 semanas</option>
            <option value="21">3 semanas</option>
            <option value="30">30 dias</option>
          </SelectNative>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Estado</label>
          <SelectNative value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as BookingStatus | '')} className="w-40">
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="confirmada">Confirmada</option>
            <option value="en_curso">En curso</option>
            <option value="finalizada">Finalizada</option>
          </SelectNative>
        </div>
        {plantas.length > 0 && (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Planta</label>
            <SelectNative value={filterPlanta} onChange={(e) => setFilterPlanta(e.target.value)} className="w-32">
              <option value="">Todas</option>
              {plantas.map((p) => <option key={p} value={p}>{p}</option>)}
            </SelectNative>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3 text-[10px] uppercase font-bold text-muted-foreground">
          <Legend color="bg-amber-400" label="Pendiente" />
          <Legend color="bg-blue-500" label="Confirmada" />
          <Legend color="bg-emerald-500" label="En curso" />
          <Legend color="bg-slate-400" label="Finalizada" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/40 sticky top-0">
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider min-w-[140px]">Habitacion</th>
              {dayList.map((d) => (
                <th key={d.toISOString()} className={cn(
                  'px-1 py-2 text-center text-[10px] font-bold border-l border-border/60',
                  isSameDay(d, new Date()) && 'bg-primary/10 text-primary',
                )}>
                  <div>{d.toLocaleDateString('es-VE', { weekday: 'short' })}</div>
                  <div className="tabular-nums font-extrabold">{d.getDate()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && cells.length === 0 ? (
              <tr><td className="py-6 text-center text-muted-foreground" colSpan={days + 1}>Cargando…</td></tr>
            ) : cells.length === 0 ? (
              <tr><td className="py-6 text-center text-muted-foreground" colSpan={days + 1}>Sin habitaciones activas</td></tr>
            ) : (
              cells.map((c) => (
                <TimelineRow
                  key={c.room.id}
                  cell={c}
                  bookings={bookings}
                  navigate={navigate}
                  dragInfo={dragInfo}
                  onDragStart={(bid, srcRoomId) => setDragInfo({ bookingId: bid, sourceRoomId: srcRoomId })}
                  onDragEnd={() => setDragInfo(null)}
                  onDrop={handleDrop}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('w-3 h-3 rounded-sm', color)} />
      {label}
    </span>
  );
}

interface TimelineRowProps {
  cell: TimelineCell;
  bookings: Booking[];
  navigate: (path: string) => void;
  dragInfo: { bookingId: number; sourceRoomId: number } | null;
  onDragStart: (bookingId: number, sourceRoomId: number) => void;
  onDragEnd: () => void;
  onDrop: (bookingId: number, targetRoomId: number, sourceRoomId: number) => void;
}

function TimelineRow({ cell, bookings, navigate, dragInfo, onDragStart, onDragEnd, onDrop }: TimelineRowProps) {
  const slots = cell.daySlots;
  const groups: Array<{ start: number; end: number; bookingId: number | null }> = [];
  for (let i = 0; i < slots.length; i++) {
    const cur = slots[i]!;
    const last = groups[groups.length - 1];
    if (last && last.bookingId === cur.bookingId) {
      last.end = i;
    } else {
      groups.push({ start: i, end: i, bookingId: cur.bookingId });
    }
  }

  const isDropTarget = dragInfo !== null && dragInfo.sourceRoomId !== cell.room.id;

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 align-top sticky left-0 bg-card">
        <p className="font-bold text-sm">Hab. {cell.room.numero}</p>
        <p className="text-[10px] text-muted-foreground">{cell.room.room_type.nombre}</p>
        {cell.room.planta && <p className="text-[10px] text-muted-foreground">Planta {cell.room.planta}</p>}
      </td>
      {slots.map((slot, i) => {
        const group = groups.find((g) => g.start === i);
        if (!group) {
          const inGroup = groups.find((g) => i > g.start && i <= g.end && g.bookingId !== null);
          if (inGroup) return null;
          return (
            <td
              key={i}
              onDragOver={(e) => { if (isDropTarget) e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragInfo) onDrop(dragInfo.bookingId, cell.room.id, dragInfo.sourceRoomId);
              }}
              className={cn(
                'border-l border-border/60 p-0.5 align-top h-12 transition-colors',
                isSameDay(slot.date, new Date()) && 'bg-primary/5',
                isDropTarget && 'bg-primary/5 outline-2 outline-dashed outline-primary/40',
              )}
            >
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams({
                    room_id: String(cell.room.id),
                    date: formatDateOnly(slot.date),
                  });
                  navigate(`/bookings?${params.toString()}`);
                }}
                className="w-full h-full hover:bg-primary/10 rounded text-[10px] text-muted-foreground/0 hover:text-primary"
                title={`Crear reserva en hab. ${cell.room.numero} para el ${formatDateOnly(slot.date)}`}
              >
                +
              </button>
            </td>
          );
        }
        if (group.bookingId === null) {
          const span = group.end - group.start + 1;
          return (
            <td
              key={i}
              colSpan={span}
              onDragOver={(e) => { if (isDropTarget) e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragInfo) onDrop(dragInfo.bookingId, cell.room.id, dragInfo.sourceRoomId);
              }}
              className={cn(
                'border-l border-border/60 p-0.5 align-top h-12 transition-colors',
                isSameDay(slot.date, new Date()) && 'bg-primary/5',
                isDropTarget && 'bg-primary/5 outline-2 outline-dashed outline-primary/40',
              )}
            />
          );
        }
        const booking = bookings.find((b) => b.id === group.bookingId)!;
        const span = group.end - group.start + 1;
        const color = STATUS_COLOR[booking.status];
        const isDragging = dragInfo?.bookingId === booking.id;
        const canDrag = ['pendiente', 'confirmada', 'en_curso'].includes(booking.status);
        return (
          <td
            key={i}
            colSpan={span}
            className="border-l border-border/60 p-0.5 align-top h-12"
          >
            <div
              draggable={canDrag}
              onDragStart={(e) => {
                if (!canDrag) return;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(booking.id));
                onDragStart(booking.id, cell.room.id);
              }}
              onDragEnd={onDragEnd}
              onClick={() => navigate(`/bookings/${booking.id}`)}
              className={cn(
                'w-full h-full rounded text-[10px] font-bold px-1.5 py-1 text-left overflow-hidden transition-all cursor-pointer',
                color,
                canDrag && 'cursor-grab active:cursor-grabbing',
                isDragging && 'opacity-50 ring-2 ring-primary',
              )}
              title={`${booking.codigo} · ${booking.customer.nombre} · ${booking.status}${booking.importe_pendiente > 0 ? ` · Saldo ${formatCurrency(booking.importe_pendiente, booking.moneda)}` : ''}${canDrag ? ' · Arrastra para mover' : ''}`}
            >
              <div className="truncate">{booking.customer.nombre}</div>
              <div className="text-[9px] truncate font-normal opacity-90">{booking.codigo}</div>
            </div>
          </td>
        );
      })}
    </tr>
  );
}
