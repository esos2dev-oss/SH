import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus, ArrowClockwise, Receipt, X, Paperclip, ArrowDown, ArrowUp, CheckCircle } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import {
  listLedger, listCategories, createLedger, conciliarLedger, uploadReceipt,
  type LedgerEntry, type LedgerType, type LedgerCategory, type PaymentMethod,
} from '../api/ledger.api';
import { formatCurrency, formatDate } from '../../../shared/lib/format';

export default function LedgerPage() {
  const [items, setItems] = useState<LedgerEntry[]>([]);
  const [categories, setCategories] = useState<LedgerCategory[]>([]);
  const [type, setType] = useState<LedgerType | ''>('');
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params: { type?: LedgerType; dateFrom: string; dateTo: string; limit: number } = { dateFrom, dateTo, limit: 100 };
      if (type) params.type = type;
      const r = await listLedger(params);
      setItems(r.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setLoading(false); }
  }
  useEffect(() => {
    void listCategories({ active: true }).then(setCategories);
  }, []);
  useEffect(() => { void load(); }, [type, dateFrom, dateTo]);

  const totalIn = items.filter((e) => e.type === 'ingreso' && e.status !== 'anulado').reduce((s, e) => s + e.monto, 0);
  const totalOut = items.filter((e) => e.type === 'egreso' && e.status !== 'anulado').reduce((s, e) => s + e.monto, 0);

  async function onConciliar(id: number) {
    try {
      await conciliarLedger(id);
      toast.success('Conciliado');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ingresos y egresos"
        subtitle="Registro contable del hotel"
        actions={
          <>
            <button type="button" onClick={() => void load()} className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"><ArrowClockwise size={12} weight="bold" /> Refrescar</button>
            <button type="button" onClick={() => setShowForm(true)} className="h-9 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm shadow-primary/20 flex items-center gap-1.5"><Plus size={12} weight="bold" /> Nuevo asiento</button>
          </>
        }
      />

      {/* Totales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi color="emerald" icon={ArrowDown} label="Ingresos" value={formatCurrency(totalIn)} />
        <Kpi color="red" icon={ArrowUp} label="Egresos" value={formatCurrency(totalOut)} />
        <Kpi color="blue" icon={Receipt} label="Neto" value={formatCurrency(totalIn - totalOut)} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Desde</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 px-3 rounded-lg border border-border bg-card text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Hasta</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 px-3 rounded-lg border border-border bg-card text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Tipo</label>
          <select value={type} onChange={(e) => setType(e.target.value as LedgerType | '')} className="h-9 px-3 rounded-lg border border-border bg-card text-sm cursor-pointer outline-none focus:border-primary">
            <option value="">Todos</option>
            <option value="ingreso">Ingresos</option>
            <option value="egreso">Egresos</option>
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Cargando...</div>
        ) : items.length === 0 ? (
          <EmptyState icon={Receipt} title="Sin asientos" description="No hay asientos en el rango seleccionado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Fecha</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Codigo</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tipo</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Categoria</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Descripcion</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Monto</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Estado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-5 py-3 text-muted-foreground">{formatDate(e.fecha)}</td>
                    <td className="px-5 py-3 font-bold">{e.codigo}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${e.type === 'ingreso' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {e.type === 'ingreso' ? 'Ingreso' : 'Egreso'}
                      </span>
                    </td>
                    <td className="px-5 py-3">{e.category.nombre}</td>
                    <td className="px-5 py-3">
                      <p>{e.descripcion}</p>
                      {(e.booking || e.customer) && (
                        <p className="text-[11px] text-muted-foreground">
                          {e.booking && `Reserva ${e.booking.codigo}`}
                          {e.customer && ` · ${e.customer.nombre}`}
                        </p>
                      )}
                      {e.receipts_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-primary mt-1"><Paperclip size={10} /> {e.receipts_count} comprobante(s)</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{e.type === 'ingreso' ? '+' : '-'}{formatCurrency(e.monto, e.moneda)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase ${e.status === 'conciliado' ? 'text-emerald-700' : e.status === 'anulado' ? 'text-red-700' : 'text-muted-foreground'}`}>{e.status}</span>
                        {e.status === 'registrado' && (
                          <button type="button" onClick={() => void onConciliar(e.id)} title="Conciliar" className="text-emerald-600 hover:text-emerald-700"><CheckCircle size={14} weight="duotone" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <LedgerFormDialog
          categories={categories}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void load(); }}
        />
      )}
    </div>
  );
}

function Kpi({ color, icon: Icon, label, value }: { color: 'emerald' | 'red' | 'blue'; icon: typeof Receipt; label: string; value: string }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400',
  };
  return (
    <div className="bg-card p-6 rounded-3xl border border-border shadow-sm">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${colors[color]}`}><Icon size={20} weight="duotone" /></div>
      <p className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">{label}</p>
      <h3 className="text-3xl font-extrabold mt-1 tracking-tight tabular-nums">{value}</h3>
    </div>
  );
}

function LedgerFormDialog({ categories, onClose, onSaved }: { categories: LedgerCategory[]; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<LedgerType>('egreso');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [fecha, setFecha] = useState(today());
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState(0);
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filteredCats = categories.filter((c) => c.type === type);
  useEffect(() => {
    if (filteredCats.length && !filteredCats.find((c) => c.id === categoryId)) {
      setCategoryId(filteredCats[0]!.id);
    }
  }, [type]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!categoryId || !descripcion.trim() || monto <= 0) {
      toast.error('Completa categoria, descripcion y monto');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createLedger({
        type,
        category_id: categoryId,
        fecha,
        descripcion: descripcion.trim(),
        monto,
        method: method || null,
      });
      if (file) {
        try {
          await uploadReceipt(created.id, file);
          toast.success('Asiento creado con comprobante');
        } catch (err) {
          toast.warning('Asiento creado pero el comprobante fallo: ' + (err instanceof ApiError ? err.message : 'error'));
        }
      } else {
        toast.success('Asiento creado');
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Nuevo asiento</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Tipo</label>
              <select value={type} onChange={(e) => setType(e.target.value as LedgerType)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer outline-none focus:border-primary focus:bg-card">
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Categoria</label>
              <select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer outline-none focus:border-primary focus:bg-card">
                <option value="">— Seleccionar —</option>
                {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Monto</label>
              <input type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(Number(e.target.value))} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Descripcion</label>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" placeholder="Compra suministros limpieza" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Metodo de pago</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer outline-none focus:border-primary focus:bg-card">
              <option value="">— Sin especificar —</option>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="paypal">PayPal</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Comprobante (opcional)</label>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block text-sm file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-secondary file:text-secondary-foreground file:font-semibold file:cursor-pointer" />
            {file && <p className="text-xs text-muted-foreground mt-1">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-60">{submitting ? 'Guardando...' : 'Crear asiento'}</button>
            <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function today(): string { return new Date().toISOString().slice(0, 10); }
function firstDayOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
