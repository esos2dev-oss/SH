import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus, ArrowClockwise, X } from '@phosphor-icons/react';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { listRoomTypes, createRoomType, updateRoomType, deleteRoomType, type RoomType } from '../api/rooms.api';
import { formatCurrency } from '../../../shared/lib/format';
import { useDialog } from '../../../shared/components/ui/dialog-system';
import { missingFields, missingFieldsMessage } from '../../../shared/lib/validate';

export default function RoomTypesPage() {
  const dialog = useDialog();
  const [items, setItems] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RoomType | null>(null);

  async function load() {
    setLoading(true);
    try { setItems(await listRoomTypes()); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function onDelete(id: number, nombre: string) {
    if (!(await dialog.confirm({ title: `Desactivar tipo "${nombre}"?`, message: 'No podras asignarlo a nuevas cabanas, pero las existentes lo conservan.', danger: true, confirmLabel: 'Desactivar' }))) return;
    try {
      await deleteRoomType(id);
      toast.success('Tipo desactivado');
      await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tipos de cabana"
        subtitle="Configura tipos, capacidad y tarifas (USD y opcional en Bs)"
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
        <EmptyState title="Sin tipos de cabana" description="Crea el primer tipo para empezar." />
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
                <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Por dia</span>
                  <span className="font-semibold tabular-nums text-right">
                    {formatCurrency(rt.tarifa_dia, rt.moneda)}
                    {rt.tarifa_dia_bs != null && <span className="block text-[11px] text-muted-foreground">Bs {rt.tarifa_dia_bs.toLocaleString()}</span>}
                  </span>
                </div>
                {rt.tarifa_semana && (
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Por semana</span>
                    <span className="font-semibold tabular-nums text-right">
                      {formatCurrency(rt.tarifa_semana, rt.moneda)}
                      {rt.tarifa_semana_bs != null && <span className="block text-[11px] text-muted-foreground">Bs {rt.tarifa_semana_bs.toLocaleString()}</span>}
                    </span>
                  </div>
                )}
                {rt.tarifa_mes && (
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Por mes</span>
                    <span className="font-semibold tabular-nums text-right">
                      {formatCurrency(rt.tarifa_mes, rt.moneda)}
                      {rt.tarifa_mes_bs != null && <span className="block text-[11px] text-muted-foreground">Bs {rt.tarifa_mes_bs.toLocaleString()}</span>}
                    </span>
                  </div>
                )}
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
  const [tarifaDia, setTarifaDia] = useState<number | ''>(rt?.tarifa_dia ?? '');
  const [tarifaSemana, setTarifaSemana] = useState<number | ''>(rt?.tarifa_semana ?? '');
  const [tarifaMes, setTarifaMes] = useState<number | ''>(rt?.tarifa_mes ?? '');
  const [tarifaDiaBs, setTarifaDiaBs] = useState<number | ''>(rt?.tarifa_dia_bs ?? '');
  const [tarifaSemanaBs, setTarifaSemanaBs] = useState<number | ''>(rt?.tarifa_semana_bs ?? '');
  const [tarifaMesBs, setTarifaMesBs] = useState<number | ''>(rt?.tarifa_mes_bs ?? '');
  const [moneda, setMoneda] = useState(rt?.moneda ?? 'USD');
  const [amenities, setAmenities] = useState((rt?.amenities ?? []).join(', '));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const missing = missingFields(
      { nombre, capacidad, tarifa_dia: tarifaDia },
      [
        { key: 'nombre',      label: 'Nombre' },
        { key: 'capacidad',   label: 'Capacidad' },
        { key: 'tarifa_dia',  label: 'Tarifa por dia (USD)' },
      ],
    );
    const msg = missingFieldsMessage(missing);
    if (msg) { setFormError(msg); return; }

    setSubmitting(true);
    try {
      const data = {
        nombre: nombre.trim(),
        slug: slug.trim() || nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        descripcion: descripcion.trim() || null,
        capacidad,
        tarifa_dia: Number(tarifaDia),
        tarifa_semana:    tarifaSemana    === '' ? null : Number(tarifaSemana),
        tarifa_mes:       tarifaMes       === '' ? null : Number(tarifaMes),
        tarifa_dia_bs:    tarifaDiaBs     === '' ? null : Number(tarifaDiaBs),
        tarifa_semana_bs: tarifaSemanaBs  === '' ? null : Number(tarifaSemanaBs),
        tarifa_mes_bs:    tarifaMesBs     === '' ? null : Number(tarifaMesBs),
        moneda,
        amenities: amenities.split(',').map((a) => a.trim()).filter(Boolean),
      };
      if (rt) await updateRoomType(rt.id, data);
      else await createRoomType(data);
      toast.success(rt ? 'Tipo actualizado' : 'Tipo creado');
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error';
      setFormError(message);
      toast.error(message);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{rt ? `Editar ${rt.nombre}` : 'Nuevo tipo de cabana'}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre" required value={nombre} onChange={setNombre} placeholder="Matrimonial Sencilla" />
            <Input label="Slug (auto si vacio)" value={slug} onChange={setSlug} placeholder="matrimonial-sencilla" />
          </div>
          <Input label="Descripcion" value={descripcion} onChange={setDescripcion} placeholder="Opcional" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Capacidad (personas)" required type="number" value={String(capacidad)} onChange={(v) => setCapacidad(Number(v))} />
            <Input label="Moneda base" value={moneda} onChange={setMoneda} />
          </div>

          <fieldset className="border border-border rounded-xl p-3">
            <legend className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">Tarifas en USD</legend>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Dia" required type="number" value={String(tarifaDia)} onChange={(v) => setTarifaDia(v === '' ? '' : Number(v))} />
              <Input label="Semana (opcional)" type="number" value={String(tarifaSemana)} onChange={(v) => setTarifaSemana(v === '' ? '' : Number(v))} />
              <Input label="Mes (opcional)" type="number" value={String(tarifaMes)} onChange={(v) => setTarifaMes(v === '' ? '' : Number(v))} />
            </div>
          </fieldset>

          <fieldset className="border border-border rounded-xl p-3">
            <legend className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">Tarifas en Bs (opcional)</legend>
            <p className="text-[11px] text-muted-foreground px-1 pb-2">Si dejas vacio, el sistema convierte desde USD usando la tasa BCV del dia.</p>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Dia (Bs)" type="number" value={String(tarifaDiaBs)} onChange={(v) => setTarifaDiaBs(v === '' ? '' : Number(v))} />
              <Input label="Semana (Bs)" type="number" value={String(tarifaSemanaBs)} onChange={(v) => setTarifaSemanaBs(v === '' ? '' : Number(v))} />
              <Input label="Mes (Bs)" type="number" value={String(tarifaMesBs)} onChange={(v) => setTarifaMesBs(v === '' ? '' : Number(v))} />
            </div>
          </fieldset>

          <Input label="Amenities (separado por coma)" value={amenities} onChange={setAmenities} placeholder="wifi, tv, aire acondicionado" />

          {formError && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 font-medium">
              {formError}
            </div>
          )}

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

function Input({ label, value, onChange, type = 'text', placeholder, required }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" />
    </div>
  );
}
