import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '../../../shared/lib/errors';
import { toast } from 'sonner';
import { X } from '@phosphor-icons/react';
import { createRoom, updateRoom, listRoomTypes, type Room, type RoomType, type RoomStatus } from '../api/rooms.api';

interface Props {
  room: Room | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RoomFormDialog({ room, onClose, onSaved }: Props) {
  const [types, setTypes] = useState<RoomType[]>([]);
  const [numero, setNumero] = useState(room?.numero ?? '');
  const [roomTypeId, setRoomTypeId] = useState<number>(room?.room_type.id ?? 0);
  const [planta, setPlanta] = useState(room?.planta ?? '');
  const [status, setStatus] = useState<RoomStatus>(room?.status ?? 'disponible');
  const [notas, setNotas] = useState(room?.notas ?? '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void listRoomTypes({ active: true }).then((rs) => {
      setTypes(rs);
      if (!roomTypeId && rs.length) setRoomTypeId(rs[0]!.id);
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!numero.trim() || !roomTypeId) {
      toast.error('Completa numero y tipo');
      return;
    }
    setSubmitting(true);
    try {
      const data = {
        numero: numero.trim(),
        room_type_id: roomTypeId,
        planta: planta.trim() || null,
        status,
        notas: notas.trim() || null,
      };
      if (room) await updateRoom(room.id, data);
      else await createRoom(data);
      toast.success(room ? 'Habitacion actualizada' : 'Habitacion creada');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{room ? `Editar habitacion ${room.numero}` : 'Nueva habitacion'}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Numero</label>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" placeholder="101" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Tipo</label>
            <select value={roomTypeId} onChange={(e) => setRoomTypeId(Number(e.target.value))} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer outline-none focus:border-primary focus:bg-card">
              {types.map((t) => <option key={t.id} value={t.id}>{t.nombre} — {t.tarifa_dia} {t.moneda}/dia</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Planta</label>
              <input value={planta} onChange={(e) => setPlanta(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" placeholder="1" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as RoomStatus)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer outline-none focus:border-primary focus:bg-card">
                <option value="disponible">Disponible</option>
                <option value="ocupada">Ocupada</option>
                <option value="limpieza">Limpieza</option>
                <option value="mantenimiento">Mantenimiento</option>
                <option value="fuera_servicio">Fuera servicio</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Notas</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-60">
              {submitting ? 'Guardando...' : room ? 'Actualizar' : 'Crear'}
            </button>
            <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
