// Panel de habitaciones — grid con badges + filtros + cambio de status.

import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Bed, ArrowClockwise, Plus, Funnel, Wrench, Sparkle, CheckCircle, Lock, X } from '@phosphor-icons/react';

import { useAuth } from '../../../contexts/AuthContext';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { RoomStatusBadge } from '../../../shared/components/ui/StatusBadge';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { listRooms, occupancy, updateRoomStatus, type Room, type RoomStatus, type OccupancySummary } from '../api/rooms.api';
import { RoomFormDialog } from '../components/RoomFormDialog';
import { formatCurrency } from '../../../shared/lib/format';

const STATUS_OPTIONS: { value: RoomStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'disponible', label: 'Disponibles' },
  { value: 'ocupada', label: 'Ocupadas' },
  { value: 'limpieza', label: 'En limpieza' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'fuera_servicio', label: 'Fuera servicio' },
];

const STATUS_ICONS: Record<RoomStatus, typeof Bed> = {
  disponible: CheckCircle,
  ocupada: Lock,
  limpieza: Sparkle,
  mantenimiento: Wrench,
  fuera_servicio: X,
};

export default function RoomsPage() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [summary, setSummary] = useState<OccupancySummary | null>(null);
  const [filterStatus, setFilterStatus] = useState<RoomStatus | ''>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);

  const canManage = user && ['superadmin', 'admin'].includes(user.role);
  const canSetStatus = user && ['superadmin', 'admin', 'recepcion', 'limpieza'].includes(user.role);

  async function load() {
    setLoading(true);
    try {
      const [roomsList, occ] = await Promise.all([
        listRooms({ active: true }),
        occupancy(),
      ]);
      setRooms(roomsList);
      setSummary(occ);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error cargando habitaciones');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    return rooms.filter((r) => {
      if (filterStatus && r.status !== filterStatus) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!r.numero.toLowerCase().includes(s) && !r.room_type.nombre.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [rooms, filterStatus, search]);

  async function changeStatus(room: Room, status: RoomStatus) {
    try {
      await updateRoomStatus(room.id, status);
      toast.success(`Habitacion ${room.numero}: ${status}`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Habitaciones"
        subtitle={summary ? `${summary.byStatus.ocupada} ocupadas de ${summary.total} (${Math.round(summary.occupancyRate * 100)}%)` : 'Cargando...'}
        actions={
          <>
            <button type="button" onClick={() => void load()} className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted transition-all flex items-center gap-1.5">
              <ArrowClockwise size={12} weight="bold" /> Refrescar
            </button>
            {canManage && (
              <button type="button" onClick={() => { setEditing(null); setFormOpen(true); }} className="h-9 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 flex items-center gap-1.5">
                <Plus size={12} weight="bold" /> Nueva habitacion
              </button>
            )}
          </>
        }
      />

      {/* Resumen ocupacion */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(['disponible', 'ocupada', 'limpieza', 'mantenimiento', 'fuera_servicio'] as RoomStatus[]).map((s) => {
            const Icon = STATUS_ICONS[s];
            const count = summary.byStatus[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
                className={`text-left bg-card p-4 rounded-2xl border border-border shadow-sm transition-all ${filterStatus === s ? 'ring-2 ring-primary' : 'hover:bg-muted/30'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon size={18} weight="duotone" className="text-muted-foreground" />
                  <span className="text-2xl font-extrabold tabular-nums">{count}</span>
                </div>
                <RoomStatusBadge status={s} />
              </button>
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <Funnel size={14} className="text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por numero o tipo..."
          className="h-9 px-3 rounded-lg border border-border bg-card text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as RoomStatus | '')}
          className="h-9 px-3 rounded-lg border border-border bg-card text-sm cursor-pointer outline-none focus:border-primary"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} de {rooms.length}</span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Bed}
          title="Sin habitaciones"
          description={rooms.length === 0 ? 'Aun no se han registrado habitaciones.' : 'No hay habitaciones que cumplan el filtro.'}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((room) => (
            <div key={room.id} className="bg-card rounded-2xl border border-border shadow-sm p-4 transition-all hover:shadow-md">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs text-muted-foreground">Habitacion</p>
                  <h3 className="text-2xl font-extrabold tracking-tight">{room.numero}</h3>
                </div>
                <Bed size={28} weight="duotone" className="text-primary/70" />
              </div>
              <div className="space-y-1 text-xs">
                <p className="text-muted-foreground">{room.room_type.nombre}{room.planta ? ` · planta ${room.planta}` : ''}</p>
                <p className="font-semibold">{formatCurrency(room.room_type.tarifa_dia)} / dia</p>
              </div>
              <div className="mt-3"><RoomStatusBadge status={room.status} /></div>
              {canSetStatus && (
                <div className="mt-3">
                  <select
                    value={room.status}
                    onChange={(e) => void changeStatus(room, e.target.value as RoomStatus)}
                    className="w-full h-8 px-2 text-xs rounded-lg border border-border bg-muted/50 outline-none focus:border-primary cursor-pointer"
                    disabled={user?.role === 'limpieza' && room.status !== 'limpieza'}
                  >
                    <option value="disponible">Marcar disponible</option>
                    {user?.role !== 'limpieza' && (
                      <>
                        <option value="ocupada">Marcar ocupada</option>
                        <option value="limpieza">Marcar limpieza</option>
                        <option value="mantenimiento">Marcar mantenimiento</option>
                        <option value="fuera_servicio">Fuera servicio</option>
                      </>
                    )}
                  </select>
                </div>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => { setEditing(room); setFormOpen(true); }}
                  className="mt-2 text-[11px] text-primary font-semibold hover:underline"
                >
                  Editar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <RoomFormDialog
          room={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); void load(); }}
        />
      )}
    </div>
  );
}
