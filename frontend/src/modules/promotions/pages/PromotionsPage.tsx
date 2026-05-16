import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus, ArrowClockwise, Tag, X } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { listPromotions, createPromotion, updatePromotion, deletePromotion, type Promotion } from '../api/promotions.api';
import { formatDate, formatCurrency } from '../../../shared/lib/format';

export default function PromotionsPage() {
  const [items, setItems] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);

  async function load() {
    setLoading(true);
    try {
      setItems(await listPromotions());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function onDelete(id: number, codigo: string) {
    if (!confirm(`Desactivar promocion "${codigo}"?`)) return;
    try {
      await deletePromotion(id);
      toast.success('Promocion desactivada');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promociones"
        subtitle="Codigos de descuento + reglas"
        actions={
          <>
            <button type="button" onClick={() => void load()} className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"><ArrowClockwise size={12} weight="bold" /> Refrescar</button>
            <button type="button" onClick={() => { setEditing(null); setShowForm(true); }} className="h-9 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm shadow-primary/20 flex items-center gap-1.5"><Plus size={12} weight="bold" /> Nueva promocion</button>
          </>
        }
      />

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Tag} title="Sin promociones" description="Crea codigos de descuento para aplicar en reservas." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => {
            const expired = new Date(p.fecha_fin) < new Date();
            const used = p.max_usos !== null && p.usos_actuales >= p.max_usos;
            return (
              <div key={p.id} className="bg-card rounded-3xl border border-border shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <code className="text-base font-bold tracking-wider bg-primary/10 text-primary px-3 py-1 rounded-lg">{p.codigo}</code>
                  {!p.active && <span className="text-[10px] font-bold bg-muted text-muted-foreground rounded-full px-2 py-0.5 uppercase">Inactivo</span>}
                  {p.active && expired && <span className="text-[10px] font-bold bg-red-50 text-red-700 rounded-full px-2 py-0.5 uppercase">Expirada</span>}
                  {p.active && !expired && used && <span className="text-[10px] font-bold bg-amber-50 text-amber-700 rounded-full px-2 py-0.5 uppercase">Agotada</span>}
                </div>
                <h3 className="font-semibold">{p.nombre}</h3>
                {p.descripcion && <p className="text-xs text-muted-foreground mt-1">{p.descripcion}</p>}
                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Descuento</span>
                    <span className="font-semibold">{p.kind === 'porcentaje' ? `${p.valor}%` : formatCurrency(p.valor, p.moneda ?? 'USD')}</span>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Vigencia</span>
                    <span className="font-medium tabular-nums">{formatDate(p.fecha_inicio)} → {formatDate(p.fecha_fin)}</span>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Usos</span>
                    <span className="font-medium tabular-nums">{p.usos_actuales}{p.max_usos !== null ? ` / ${p.max_usos}` : ''}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={() => { setEditing(p); setShowForm(true); }} className="text-xs font-semibold text-primary hover:underline">Editar</button>
                  {p.active && <button type="button" onClick={() => void onDelete(p.id, p.codigo)} className="text-xs font-semibold text-destructive hover:underline">Desactivar</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <PromotionFormDialog
          promo={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void load(); }}
        />
      )}
    </div>
  );
}

function PromotionFormDialog({ promo, onClose, onSaved }: { promo: Promotion | null; onClose: () => void; onSaved: () => void }) {
  const [codigo, setCodigo] = useState(promo?.codigo ?? '');
  const [nombre, setNombre] = useState(promo?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(promo?.descripcion ?? '');
  const [kind, setKind] = useState<'porcentaje' | 'monto_fijo'>(promo?.kind ?? 'porcentaje');
  const [valor, setValor] = useState(promo?.valor ?? 10);
  const [fechaInicio, setFechaInicio] = useState(promo?.fecha_inicio ?? new Date().toISOString().slice(0, 10));
  const [fechaFin, setFechaFin] = useState(promo?.fecha_fin ?? '');
  const [maxUsos, setMaxUsos] = useState<number | ''>(promo?.max_usos ?? '');
  const [minNoches, setMinNoches] = useState<number | ''>((promo?.condiciones as { min_noches?: number })?.min_noches ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!codigo.trim() || !nombre.trim() || !fechaInicio || !fechaFin) {
      toast.error('Completa los campos requeridos');
      return;
    }
    setSubmitting(true);
    try {
      const condiciones: Record<string, unknown> = {};
      if (minNoches !== '' && Number(minNoches) > 0) condiciones['min_noches'] = Number(minNoches);
      const data = {
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        kind,
        valor,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        max_usos: maxUsos === '' ? null : Number(maxUsos),
        condiciones,
      };
      if (promo) await updatePromotion(promo.id, data);
      else await createPromotion(data);
      toast.success(promo ? 'Promocion actualizada' : 'Promocion creada');
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{promo ? `Editar ${promo.codigo}` : 'Nueva promocion'}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="Codigo" value={codigo} onChange={(v) => setCodigo(v.toUpperCase())} required disabled={!!promo} />
            <FieldInput label="Nombre" value={nombre} onChange={setNombre} required />
          </div>
          <FieldInput label="Descripcion" value={descripcion} onChange={setDescripcion} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Tipo</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as 'porcentaje' | 'monto_fijo')} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer outline-none focus:border-primary focus:bg-card">
                <option value="porcentaje">Porcentaje</option>
                <option value="monto_fijo">Monto fijo</option>
              </select>
            </div>
            <FieldInput label="Valor" type="number" value={String(valor)} onChange={(v) => setValor(Number(v))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="Inicio" type="date" value={fechaInicio} onChange={setFechaInicio} required />
            <FieldInput label="Fin" type="date" value={fechaFin} onChange={setFechaFin} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="Maximo usos (opcional)" type="number" value={String(maxUsos)} onChange={(v) => setMaxUsos(v === '' ? '' : Number(v))} />
            <FieldInput label="Min noches (opcional)" type="number" value={String(minNoches)} onChange={(v) => setMinNoches(v === '' ? '' : Number(v))} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-60">{submitting ? 'Guardando...' : promo ? 'Actualizar' : 'Crear'}</button>
            <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldInput({ label, value, onChange, type = 'text', required, disabled }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; disabled?: boolean }) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">{label} {required && <span className="text-destructive">*</span>}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card disabled:opacity-60" />
    </div>
  );
}
