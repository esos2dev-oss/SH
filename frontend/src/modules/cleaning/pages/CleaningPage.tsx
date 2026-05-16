// Vista de limpieza, optimizada para movil. Botones grandes, alta densidad de informacion.
// El rol "limpieza" solo ve y opera esta pantalla.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Broom, CheckCircle, Wrench, ArrowsClockwise } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { listRooms, updateRoomStatus, type Room } from '../../rooms/api/rooms.api';
import { cn } from '../../../shared/lib/cn';
import { useDialog } from '../../../shared/components/ui/dialog-system';

export default function CleaningPage() {
  const dialog = useDialog();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'limpieza' | 'mantenimiento'>('limpieza');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listRooms({ active: true });
      setRooms(r);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const cleaning = useMemo(() => rooms.filter((r) => r.status === 'limpieza'), [rooms]);
  const maintenance = useMemo(() => rooms.filter((r) => r.status === 'mantenimiento'), [rooms]);

  async function markAvailable(room: Room) {
    try {
      await updateRoomStatus(room.id, 'disponible');
      toast.success(`Hab. ${room.numero} marcada como disponible`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  async function reportIssue(room: Room) {
    const notas = await dialog.prompt({
      title: `Reportar problema en Hab. ${room.numero}`,
      message: 'Describe brevemente que pasa. La habitacion pasara a mantenimiento.',
      placeholder: 'Ej: grifo del bano gotea',
      required: true,
      multiline: true,
      maxLength: 500,
      confirmLabel: 'Reportar',
    });
    if (!notas) return;
    try {
      await updateRoomStatus(room.id, 'mantenimiento', notas);
      toast.success(`Hab. ${room.numero} marcada como mantenimiento`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  const list = tab === 'limpieza' ? cleaning : maintenance;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Limpieza"
        subtitle={`${cleaning.length} pendientes · ${maintenance.length} en mantenimiento`}
        actions={
          <button type="button" onClick={() => void load()} className="h-10 w-10 rounded-lg border border-border bg-card hover:bg-muted flex items-center justify-center">
            <ArrowsClockwise size={16} className={cn(loading && 'animate-spin')} />
          </button>
        }
      />

      <div className="flex bg-card border border-border rounded-2xl p-1">
        <Tab active={tab === 'limpieza'} onClick={() => setTab('limpieza')} count={cleaning.length} label="Por limpiar" icon={Broom} />
        <Tab active={tab === 'mantenimiento'} onClick={() => setTab('mantenimiento')} count={maintenance.length} label="Mantenimiento" icon={Wrench} />
      </div>

      {loading && list.length === 0 ? (
        <p className="text-center py-12 text-sm text-muted-foreground">Cargando…</p>
      ) : list.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 mb-3">
            <CheckCircle size={28} weight="duotone" />
          </div>
          <p className="text-sm font-semibold">
            {tab === 'limpieza' ? 'Todo limpio. Sin habitaciones pendientes.' : 'Sin habitaciones en mantenimiento.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((room) => (
            <RoomTile
              key={room.id}
              room={room}
              onMarkClean={() => void markAvailable(room)}
              onReport={() => void reportIssue(room)}
              tab={tab}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Tab({ active, onClick, count, label, icon: Icon }: { active: boolean; onClick: () => void; count: number; label: string; icon: typeof Broom }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all',
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      <Icon size={14} weight="duotone" />
      {label}
      <span className={cn('rounded px-1.5 text-[10px] font-mono', active ? 'bg-primary-foreground/20' : 'bg-muted-foreground/10')}>{count}</span>
    </button>
  );
}

function RoomTile({ room, onMarkClean, onReport, tab }: { room: Room; onMarkClean: () => void; onReport: () => void; tab: 'limpieza' | 'mantenimiento' }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-2xl font-extrabold tabular-nums">{room.numero}</h3>
        <span className={cn(
          'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded',
          tab === 'limpieza' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
        )}>
          {tab === 'limpieza' ? 'Por limpiar' : 'Mantenimiento'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {room.room_type.nombre}
        {room.planta && ` · Planta ${room.planta}`}
      </p>
      {room.notas && (
        <p className="text-[11px] text-muted-foreground mt-2 italic line-clamp-2">{room.notas}</p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onMarkClean}
          className="h-12 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 shadow-sm shadow-emerald-600/30 flex items-center justify-center gap-1.5"
        >
          <CheckCircle size={16} weight="bold" /> Lista
        </button>
        {tab === 'limpieza' ? (
          <button
            type="button"
            onClick={onReport}
            className="h-12 rounded-xl border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 font-bold text-sm hover:bg-orange-100 dark:hover:bg-orange-950/50 flex items-center justify-center gap-1.5"
          >
            <Wrench size={14} weight="bold" /> Problema
          </button>
        ) : (
          <button
            type="button"
            onClick={onMarkClean}
            className="h-12 rounded-xl border border-border bg-card text-muted-foreground text-sm hover:bg-muted font-bold flex items-center justify-center"
          >
            Resuelto
          </button>
        )}
      </div>
    </div>
  );
}
