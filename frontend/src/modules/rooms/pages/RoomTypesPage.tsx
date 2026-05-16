import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus, ArrowClockwise, X } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { listRoomTypes, createRoomType, updateRoomType, deleteRoomType, type RoomType } from '../api/rooms.api';
import { formatCurrency } from '../../../shared/lib/format';

export default function RoomTypesPage() {
  const [items, setItems] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RoomType | null>(null);

  async function load() {
    setLoading(true);
    try {
      setItems(await listRoomTypes());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function onDelete(id: number, nombre: string) {
    if (!confirm(`Desactivar tipo "${nombre}"?`)) return;
    try {
      await deleteRoomType(id);
      toast.success('Tipo desactivado');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tipos de habitacion"
        subtitle="Configura tipos, capacidad y tarifas"
        actions={
          <>
            <button type="button" onClick={() => void load()} className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"><ArrowClockwise size={12} weight="bold" /> Refrescar</button>
            <button type="button" onClick={() => { setEditing(null); setShowForm(true); }} className="h-9 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm shadow-primary/20 flex items-center gap-1.5"><Plus size={12} weight="bold" /> Nuevo tipo</button>
          </>
        }
      />

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>
      ) : items.length === 0 ? (
        <EmptyState title="Sin tipos de habitacion" description="Crea el primer tipo para empezar." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((rt) => (
            <div key={rt.id} className="bg-card rounded-3xl border border-border shadow-sm p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xl font-bold tracking-tight">{rt.nombre}</h3>
                {!rt.active && <span className="text-[10px] font-bold bg-muted text-muted-foreground rounded-full px-2 py-0.5 uppercase">Inactivo</span>}
              </div>
              {rt.descripcion && <p className="text-xs text-muted-foreground mb-3">{rt.descripcion}</p>}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Capacidad</span><span className="font-semibold">{rt.capacidad} pax</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Por dia</span><span className="font-semibold tabular-nums">{formatCurrency(rt.tarifa_dia, rt.moneda)}</span></div>
                {rt.tarifa_semana && <div className="flex justify-between"><span className="text-muted-foreground">Por semana</span><span className="font-semibold tabular-nums">{formatCurrency(rt.tarifa_semana, rt.moneda)}</span></div>}
                {rt.tarifa_mes && <div className="flex justify-between"><span className="text-muted-foreground">Por mes</span><span className="font-semibold tabular-nums">{formatCurrency(rt.tarifa_mes, rt.moneda)}</span></div>}
              </div>
              {rt.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {rt.amenities.map((a) => <span key={a} className="text-[10px] bg-muted text-muted-foreground rounded-full px-2 py-0.5">{a}</span>)}
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <button type="button" onClick={() => { setEditing(rt); setShowForm(true); }} className="text-xs font-semibold text-primary hover:underline">Editar</button>
                {rt.active && <button type="button" onClick={() => void onDelete(rt.id, rt.nombre)} className="text-xs font-semibold text-destructive hover:underline">Desactivar</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <RoomTypeFormDialog
          rt={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void load(); }}
        />
      )}
    </div>
  );
}

function RoomTypeFormDialog({ rt, onClose, onSaved }: { rt: RoomType | null; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState(rt?.nombre ?? '');
  const [slug, setSlug] = useState(rt?.slug ?? '');
  const [descripcion, setDescripcion] = useState(rt?.descripcion ?? '');
  const [capacidad, setCapacidad] = useState(rt?.capacidad ?? 1);
  const [tarifaDia, setTarifaDia] = useState(rt?.tarifa_dia ?? 0);
  const [tarifaSemana, setTarifaSemana] = useState<number | ''>(rt?.tarifa_semana ?? '');
  const [tarifaMes, setTarifaMes] = useState<number | ''>(rt?.tarifa_mes ?? '');
  const [moneda, setMoneda] = useState(rt?.moneda ?? 'USD');
  const [amenities, setAmenities] = useState((rt?.amenities ?? []).join(', '));
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = {
        nombre: nombre.trim(),
        slug: slug.trim() || nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        descripcion: descripcion.trim() || null,
        capacidad,
        tarifa_dia: tarifaDia,
        tarifa_semana: tarifaSemana === '' ? null : Number(tarifaSemana),
        tarifa_mes: tarifaMes === '' ? null : Number(tarifaMes),
        moneda,
        amenities: amenities.split(',').map((a) => a.trim()).filter(Boolean),
      };
      if (rt) await updateRoomType(rt.id, data);
      else await createRoomType(data);
      toast.success(rt ? 'Tipo actualizado' : 'Tipo creado');
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{rt ? `Editar ${rt.nombre}` : 'Nuevo tipo'}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre" value={nombre} onChange={setNombre} placeholder="Suite" />
            <Input label="Slug" value={slug} onChange={setSlug} placeholder="suite (auto si vacio)" />
          </div>
          <Input label="Descripcion" value={descripcion} onChange={setDescripcion} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Capacidad" type="number" value={String(capacidad)} onChange={(v) => setCapacidad(Number(v))} />
            <Input label="Moneda" value={moneda} onChange={setMoneda} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Tarifa dia" type="number" value={String(tarifaDia)} onChange={(v) => setTarifaDia(Number(v))} />
            <Input label="Tarifa semana" type="number" value={String(tarifaSemana)} onChange={(v) => setTarifaSemana(v === '' ? '' : Number(v))} />
            <Input label="Tarifa mes" type="number" value={String(tarifaMes)} onChange={(v) => setTarifaMes(v === '' ? '' : Number(v))} />
          </div>
          <Input label="Amenities (separado por coma)" value={amenities} onChange={setAmenities} placeholder="wifi, tv, ducha" />
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-60">
              {submitting ? 'Guardando...' : rt ? 'Actualizar' : 'Crear'}
            </button>
            <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" />
    </div>
  );
}
