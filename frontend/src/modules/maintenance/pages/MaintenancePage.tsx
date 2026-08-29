// Panel de mantenimiento — lista + crear + marcar completada.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Wrench, Plus, ArrowClockwise, CheckCircle, PlayCircle, X, Warning, StarFour } from '@phosphor-icons/react';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { useDialog } from '../../../shared/components/ui/dialog-system';
import { listRooms, type Room } from '../../rooms/api/rooms.api';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { missingFields, missingFieldsMessage } from '../../../shared/lib/validate';
import {
  listMaintenance, createMaintenance, startMaintenance, completeMaintenance, cancelMaintenance,
  MAINT_TYPE_LABELS, MAINT_STATUS_LABELS,
  type MaintenanceOrder, type MaintenanceType, type MaintenanceStatus,
} from '../api/maintenance.api';

const STATUS_COLORS: Record<MaintenanceStatus, string> = {
  pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  en_proceso: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  completado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  cancelado: 'bg-muted text-muted-foreground',
};

const PRIORIDAD_LABEL: Record<1 | 2 | 3, { label: string; className: string }> = {
  1: { label: 'Alta',   className: 'text-red-600 dark:text-red-400' },
  2: { label: 'Media',  className: 'text-amber-600 dark:text-amber-400' },
  3: { label: 'Baja',   className: 'text-muted-foreground' },
};

export default function MaintenancePage() {
  const dialog = useDialog();
  const [items, setItems] = useState<MaintenanceOrder[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<MaintenanceStatus | ''>('');
  const [filterExterno, setFilterExterno] = useState<'all' | 'externo' | 'interno'>('all');
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params: { status?: MaintenanceStatus; externo?: boolean } = {};
      if (filterStatus) params.status = filterStatus;
      if (filterExterno === 'externo') params.externo = true;
      if (filterExterno === 'interno') params.externo = false;
      setItems(await listMaintenance(params));
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [filterStatus, filterExterno]);
  useEffect(() => { void listRooms({ active: true }).then(setRooms); }, []);

  const totales = useMemo(() => ({
    pendientes: items.filter((o) => o.status === 'pendiente').length,
    en_proceso: items.filter((o) => o.status === 'en_proceso').length,
    externos: items.filter((o) => o.servicio_externo && ['pendiente','en_proceso'].includes(o.status)).length,
    costoAcumulado: items.filter((o) => o.status === 'completado').reduce((s, o) => s + Number(o.costo ?? 0), 0),
  }), [items]);

  async function onStart(o: MaintenanceOrder) {
    try { await startMaintenance(o.id); toast.success('Marcado en proceso'); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
  }

  async function onComplete(o: MaintenanceOrder) {
    const notas = await dialog.prompt({
      title: `Cerrar mantenimiento`, message: `${o.titulo}\n\nOpcional: notas de cierre (que se hizo).`,
      placeholder: 'Ej: cambiado el termostato, funciona OK',
      multiline: true, required: false,
    });
    try { await completeMaintenance(o.id, notas ?? undefined); toast.success('Mantenimiento completado'); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
  }

  async function onCancel(o: MaintenanceOrder) {
    if (!(await dialog.confirm({ title: `Cancelar mantenimiento?`, message: o.titulo, danger: true, confirmLabel: 'Si, cancelar' }))) return;
    try { await cancelMaintenance(o.id); toast.success('Cancelado'); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mantenimiento"
        subtitle="Ordenes de mantenimiento del hotel · Habitaciones y areas comunes"
        actions={
          <>
            <button type="button" onClick={() => void load()} className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"><ArrowClockwise size={12} weight="bold" /> Refrescar</button>
            <button type="button" onClick={() => setShowForm(true)} className="h-9 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm flex items-center gap-1.5"><Plus size={12} weight="bold" /> Nueva orden</button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi color="amber" icon={Warning} label="Pendientes" value={totales.pendientes} />
        <Kpi color="blue" icon={PlayCircle} label="En proceso" value={totales.en_proceso} />
        <Kpi color="violet" icon={StarFour} label="Servicios externos activos" value={totales.externos} />
        <Kpi color="emerald" icon={CheckCircle} label="Costo acumulado (completados)" value={formatCurrency(totales.costoAcumulado, 'EUR')} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as MaintenanceStatus | '')}
          className="h-9 px-3 rounded-lg border border-border bg-card text-sm cursor-pointer">
          <option value="">Todos los estados</option>
          {(['pendiente','en_proceso','completado','cancelado'] as const).map((s) => <option key={s} value={s}>{MAINT_STATUS_LABELS[s]}</option>)}
        </select>
        <select value={filterExterno} onChange={(e) => setFilterExterno(e.target.value as typeof filterExterno)}
          className="h-9 px-3 rounded-lg border border-border bg-card text-sm cursor-pointer">
          <option value="all">Todos los proveedores</option>
          <option value="externo">Solo servicio externo</option>
          <option value="interno">Solo interno</option>
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Wrench} title="Sin ordenes" description="No hay ordenes de mantenimiento con esos filtros." />
      ) : (
        <div className="space-y-2">
          {items.map((o) => (
            <div key={o.id} className="bg-card rounded-2xl border border-border p-4 flex flex-col md:flex-row md:items-start md:gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-bold">{o.titulo}</h3>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${STATUS_COLORS[o.status]}`}>{MAINT_STATUS_LABELS[o.status]}</span>
                  <span className={`text-[10px] font-bold ${PRIORIDAD_LABEL[o.prioridad].className}`}>· Prioridad {PRIORIDAD_LABEL[o.prioridad].label}</span>
                  {o.servicio_externo && (
                    <span className="text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 px-2 py-0.5 rounded-full">Servicio externo</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {MAINT_TYPE_LABELS[o.tipo]}
                  {o.room && ` · Habitacion ${o.room.numero}`}
                  {!o.room && ' · Area comun / no aplica'}
                  {' · Reportado '}{formatDateTime(o.reportado_at)}
                </p>
                {o.descripcion && <p className="text-sm mt-2">{o.descripcion}</p>}
                {(o.proveedor_nombre || o.costo) && (
                  <p className="text-[11px] mt-1 text-muted-foreground">
                    {o.proveedor_nombre && <>Proveedor: <b>{o.proveedor_nombre}</b>{o.proveedor_telefono ? ` (${o.proveedor_telefono})` : ''} </>}
                    {o.costo != null && <>· Costo: <b>{formatCurrency(o.costo, o.moneda ?? 'EUR')}</b></>}
                  </p>
                )}
                {o.notas_cierre && <p className="text-[11px] mt-1 text-emerald-700 dark:text-emerald-400">Cierre: {o.notas_cierre}</p>}
              </div>
              <div className="flex gap-2 mt-3 md:mt-0">
                {o.status === 'pendiente' && (
                  <button onClick={() => void onStart(o)} className="h-8 px-3 text-xs font-semibold border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300 rounded-lg hover:bg-blue-100 flex items-center gap-1">
                    <PlayCircle size={12} weight="bold" /> Iniciar
                  </button>
                )}
                {['pendiente','en_proceso'].includes(o.status) && (
                  <>
                    <button onClick={() => void onComplete(o)} className="h-8 px-3 text-xs font-semibold border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 rounded-lg hover:bg-emerald-100 flex items-center gap-1">
                      <CheckCircle size={12} weight="bold" /> Completar
                    </button>
                    <button onClick={() => void onCancel(o)} className="h-8 px-3 text-xs font-semibold border border-border bg-card text-muted-foreground rounded-lg hover:bg-muted flex items-center gap-1">
                      <X size={12} weight="bold" /> Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <NewMaintenanceDialog rooms={rooms} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void load(); }} />}
    </div>
  );
}

function Kpi({ color, icon: Icon, label, value }: { color: 'amber' | 'blue' | 'violet' | 'emerald'; icon: typeof Wrench; label: string; value: React.ReactNode }) {
  const colors: Record<typeof color, string> = {
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  };
  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}><Icon size={18} weight="duotone" /></div>
      <p className="text-[11px] text-muted-foreground mt-2">{label}</p>
      <p className="text-2xl font-extrabold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function NewMaintenanceDialog({ rooms, onClose, onSaved }: { rooms: Room[]; onClose: () => void; onSaved: () => void }) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState<MaintenanceType>('general');
  const [prioridad, setPrioridad] = useState<1 | 2 | 3>(2);
  const [roomId, setRoomId] = useState<number | 0>(0);
  const [servicioExterno, setServicioExterno] = useState(false);
  const [proveedorNombre, setProveedorNombre] = useState('');
  const [proveedorTelefono, setProveedorTelefono] = useState('');
  const [costo, setCosto] = useState<number | ''>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const missing = missingFields({ titulo, tipo }, [
      { key: 'titulo', label: 'Titulo' },
      { key: 'tipo',   label: 'Tipo' },
    ]);
    if (servicioExterno && !proveedorNombre.trim()) missing.push('Nombre del proveedor');
    const msg = missingFieldsMessage(missing);
    if (msg) { setFormError(msg); return; }

    setSubmitting(true);
    try {
      await createMaintenance({
        room_id: roomId || null,
        tipo, titulo: titulo.trim(), descripcion: descripcion.trim() || null,
        prioridad,
        servicio_externo: servicioExterno,
        proveedor_nombre: servicioExterno ? proveedorNombre.trim() : null,
        proveedor_telefono: servicioExterno ? proveedorTelefono.trim() || null : null,
        costo: costo === '' ? null : Number(costo),
        moneda: 'EUR',
      });
      toast.success('Orden de mantenimiento creada');
      onSaved();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Error';
      setFormError(m); toast.error(m);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Nueva orden de mantenimiento</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Titulo <span className="text-red-500">*</span></label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Aire acondicionado no enfria" className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Tipo <span className="text-red-500">*</span></label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as MaintenanceType)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer">
                {(Object.keys(MAINT_TYPE_LABELS) as MaintenanceType[]).map((t) => <option key={t} value={t}>{MAINT_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Prioridad</label>
              <select value={prioridad} onChange={(e) => setPrioridad(Number(e.target.value) as 1 | 2 | 3)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer">
                <option value={1}>Alta</option>
                <option value={2}>Media</option>
                <option value={3}>Baja</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Habitacion (opcional — dejar vacio si es area comun)</label>
            <select value={roomId} onChange={(e) => setRoomId(Number(e.target.value))} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer">
              <option value={0}>— Area comun / no aplica —</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>Hab. {r.numero} — {r.room_type.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Descripcion</label>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm" placeholder="Detalles del problema" />
          </div>

          <div className="border border-border rounded-xl p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={servicioExterno} onChange={(e) => setServicioExterno(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm font-semibold">Servicio externo (empresa/tecnico externo)</span>
            </label>
            {servicioExterno && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Nombre proveedor <span className="text-red-500">*</span></label>
                  <input value={proveedorNombre} onChange={(e) => setProveedorNombre(e.target.value)} placeholder="Ej: Servicios Ramirez" className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Telefono</label>
                  <input value={proveedorTelefono} onChange={(e) => setProveedorTelefono(e.target.value)} placeholder="+58 ..." className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Costo estimado (EUR)</label>
                  <input type="number" min={0} step="0.01" value={costo} onChange={(e) => setCosto(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0.00" className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-sm" />
                </div>
              </div>
            )}
          </div>

          {formError && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 font-medium">
              {formError}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-60">
              {submitting ? 'Creando...' : 'Crear orden'}
            </button>
            <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
