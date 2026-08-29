// Panel Desayunos: lista del dia, marcar entregado, agregar nueva orden.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Coffee, Plus, ArrowClockwise, Check, X, User, CurrencyCircleDollar } from '@phosphor-icons/react';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { useDialog } from '../../../shared/components/ui/dialog-system';
import { useAuth } from '../../../contexts/AuthContext';
import {
  listByDate, summaryByDate, upsertOrder, markDelivered, deleteOrder,
  activeBookingsToday, brutoNeto, pagarAlRestaurante,
  type BreakfastOrder, type BreakfastSummary, type BrutoNetoSummary,
} from '../api/breakfast.api';

function firstOfMonth(): string { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }

const BREAKFAST_PRICE = 7; // EUR — del setting hotel.desayuno_precio

function today(): string { return new Date().toISOString().slice(0, 10); }

export default function BreakfastPage() {
  const dialog = useDialog();
  const { user } = useAuth();
  const isRestaurante = user?.role === 'restaurante';
  const canAdminister = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'contabilidad';
  const canCreate = !isRestaurante && (user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'recepcion');
  const [fecha, setFecha] = useState(today());
  const [orders, setOrders] = useState<BreakfastOrder[]>([]);
  const [summary, setSummary] = useState<BreakfastSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  // Pago al restaurante
  const [brutoFrom, setBrutoFrom] = useState(firstOfMonth());
  const [brutoTo, setBrutoTo] = useState(today());
  const [bn, setBn] = useState<BrutoNetoSummary | null>(null);
  const [paying, setPaying] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [o, s] = await Promise.all([listByDate(fecha), summaryByDate(fecha)]);
      setOrders(o); setSummary(s);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [fecha]);

  async function loadBrutoNeto() {
    try { setBn(await brutoNeto(brutoFrom, brutoTo)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
  }
  // Admin/superadmin/contabilidad ven el panel de pago al restaurante.
  // Rol restaurante tambien recibe brutoNeto para saber cuanto se le debe.
  useEffect(() => {
    if (canAdminister || isRestaurante) void loadBrutoNeto();
  }, [brutoFrom, brutoTo, canAdminister, isRestaurante]);

  async function onPagarRestaurante() {
    if (!bn || bn.pendiente_pagar_restaurante <= 0) { toast.info('No hay desayunos pendientes por pagar en este rango'); return; }
    const confirm = await dialog.confirm({
      title: `Pagar al restaurante ${formatCurrency(bn.pendiente_pagar_restaurante, bn.moneda)}?`,
      message: `Se creara un asiento de egreso en Finanzas por ${bn.count_entregados - bn.count_pagados_al_restaurante} desayunos entregados entre ${brutoFrom} y ${brutoTo}.\n\nEsto convierte los ingresos brutos en netos.`,
      confirmLabel: 'Si, pagar y registrar',
    });
    if (!confirm) return;
    setPaying(true);
    try {
      const r = await pagarAlRestaurante(brutoFrom, brutoTo);
      if (r.ok) {
        toast.success(`Pago registrado: ${r.ledger_codigo} - ${formatCurrency(r.total ?? 0, r.moneda ?? 'EUR')}`);
        await Promise.all([load(), loadBrutoNeto()]);
      } else {
        toast.info(r.reason === 'no_pending_orders' ? 'No hay desayunos pendientes por pagar' : 'Sin cambios');
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setPaying(false); }
  }

  async function onToggleDelivered(o: BreakfastOrder) {
    try { await markDelivered(o.id, !o.entregado); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
  }

  async function onDelete(o: BreakfastOrder) {
    if (!(await dialog.confirm({ title: 'Eliminar desayuno?', message: `Hab. ${o.room?.numero} · ${o.cantidad} desayunos`, danger: true, confirmLabel: 'Eliminar' }))) return;
    try { await deleteOrder(o.id); toast.success('Eliminado'); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Desayunos"
        subtitle="Restaurante · Lista diaria de desayunos por habitacion"
        actions={
          <>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border bg-card text-sm" />
            <button type="button" onClick={() => void load()} className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"><ArrowClockwise size={12} weight="bold" /> Refrescar</button>
            {canCreate && <button type="button" onClick={() => setShowForm(true)} className="h-9 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm flex items-center gap-1.5"><Plus size={12} weight="bold" /> Agregar</button>}
          </>
        }
      />

      {/* Panel especifico rol restaurante: cuanto se le debe */}
      {isRestaurante && bn && (
        <div className="bg-gradient-to-br from-amber-500/10 to-emerald-500/10 dark:from-amber-950/30 dark:to-emerald-950/30 rounded-3xl border border-amber-200 dark:border-amber-900 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Coffee size={22} weight="duotone" className="text-amber-600" />
            <h3 className="font-bold text-base">Tu cuenta con el hotel · {brutoFrom} → {brutoTo}</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-card border border-border p-3">
              <p className="text-[10px] uppercase text-muted-foreground font-bold">Desayunos entregados</p>
              <p className="text-2xl font-extrabold tabular-nums">{bn.count_entregados}</p>
            </div>
            <div className="rounded-xl bg-card border border-border p-3">
              <p className="text-[10px] uppercase text-muted-foreground font-bold">Ya cobrados</p>
              <p className="text-2xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">{bn.count_pagados_al_restaurante}</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(bn.costo_restaurante, bn.moneda)}</p>
            </div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 p-3">
              <p className="text-[10px] uppercase text-amber-700 dark:text-amber-400 font-bold">Pendiente por cobrar</p>
              <p className="text-2xl font-extrabold tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(bn.pendiente_pagar_restaurante, bn.moneda)}</p>
              <p className="text-[10px] text-muted-foreground">{bn.count_entregados - bn.count_pagados_al_restaurante} desayunos</p>
            </div>
            <div className="rounded-xl bg-card border border-border p-3 flex flex-col justify-between">
              <p className="text-[10px] uppercase text-muted-foreground font-bold">Rango</p>
              <div className="flex items-center gap-1">
                <input type="date" value={brutoFrom} onChange={(e) => setBrutoFrom(e.target.value)} className="h-8 px-2 rounded-lg border border-border bg-background text-[11px] w-full" />
                <input type="date" value={brutoTo} onChange={(e) => setBrutoTo(e.target.value)} className="h-8 px-2 rounded-lg border border-border bg-background text-[11px] w-full" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary del dia */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi color="amber" label="Total desayunos" value={summary?.total_desayunos ?? 0} />
        <Kpi color="emerald" label="Entregados" value={summary?.total_entregados ?? 0} />
        <Kpi color="blue" label="Pendientes" value={summary?.total_pendientes ?? 0} />
        <Kpi color="violet" label="Ingreso total" value={formatCurrency(summary?.ingreso_total ?? 0, summary?.moneda ?? 'EUR')} />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}</div>
      ) : orders.length === 0 ? (
        <EmptyState icon={Coffee} title="Sin desayunos" description={`No hay desayunos registrados para ${fecha}. Usa "Agregar" para crear uno.`} />
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o.id} className={`rounded-2xl border p-4 flex items-center gap-4 flex-wrap ${o.entregado ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-border bg-card'}`}>
              <div className="w-14 h-14 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl font-extrabold tabular-nums">{o.cantidad}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold">Hab. {o.room?.numero} · {o.cantidad} {o.cantidad === 1 ? 'desayuno' : 'desayunos'}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><User size={12} /> {o.customer?.nombre} · {o.booking_codigo}</p>
                {o.notas && <p className="text-[11px] mt-1 italic">{o.notas}</p>}
                {o.entregado && o.entregado_at && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">Entregado {formatDateTime(o.entregado_at)}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-lg font-extrabold tabular-nums">{formatCurrency(o.total, o.moneda)}</p>
                <p className="text-[10px] text-muted-foreground">{formatCurrency(o.precio_unitario, o.moneda)} c/u</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => void onToggleDelivered(o)}
                  className={`h-9 px-3 text-xs font-semibold rounded-lg flex items-center gap-1 ${o.entregado ? 'border border-border bg-card hover:bg-muted' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                  {o.entregado ? <><X size={12} weight="bold" /> Deshacer</> : <><Check size={12} weight="bold" /> Entregado</>}
                </button>
                <button onClick={() => void onDelete(o)} className="h-9 w-9 border border-border bg-card rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-600 flex items-center justify-center">
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === PANEL ADMIN: PAGAR AL RESTAURANTE === */}
      {canAdminister && (
        <div className="bg-card rounded-3xl border border-border p-6">
          <div className="flex items-center gap-2 mb-3">
            <CurrencyCircleDollar size={20} weight="duotone" className="text-emerald-600" />
            <h3 className="font-bold">Pagos al restaurante · Ingreso bruto vs neto</h3>
          </div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs text-muted-foreground">Rango:</span>
            <input type="date" value={brutoFrom} onChange={(e) => setBrutoFrom(e.target.value)} className="h-9 px-3 rounded-lg border border-border bg-muted/50 text-sm" />
            <span className="text-sm text-muted-foreground">→</span>
            <input type="date" value={brutoTo} onChange={(e) => setBrutoTo(e.target.value)} className="h-9 px-3 rounded-lg border border-border bg-muted/50 text-sm" />
          </div>
          {bn && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Ingreso bruto</p>
                  <p className="text-xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(bn.ingreso_bruto, bn.moneda)}</p>
                  <p className="text-[10px] text-muted-foreground">{bn.count_entregados} entregados</p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/20 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-red-700 dark:text-red-400">Costo restaurante</p>
                  <p className="text-xl font-extrabold tabular-nums text-red-700 dark:text-red-400">{formatCurrency(bn.costo_restaurante, bn.moneda)}</p>
                  <p className="text-[10px] text-muted-foreground">{bn.count_pagados_al_restaurante} pagados</p>
                </div>
                <div className="rounded-xl border border-primary bg-primary/5 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-primary">Ingreso neto</p>
                  <p className="text-xl font-extrabold tabular-nums text-primary">{formatCurrency(bn.ingreso_neto, bn.moneda)}</p>
                  <p className="text-[10px] text-muted-foreground">bruto − pagado</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Pendiente pagar</p>
                  <p className="text-xl font-extrabold tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(bn.pendiente_pagar_restaurante, bn.moneda)}</p>
                  <p className="text-[10px] text-muted-foreground">entregado sin pagar</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void onPagarRestaurante()}
                disabled={paying || bn.pendiente_pagar_restaurante <= 0}
                className="h-11 px-6 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {paying ? 'Registrando...' : `Pagar al restaurante ${formatCurrency(bn.pendiente_pagar_restaurante, bn.moneda)} y crear egreso`}
              </button>
              <p className="text-[11px] text-muted-foreground mt-2">
                Al confirmar se crea automaticamente un asiento en Finanzas → categoria &quot;Pago al restaurante&quot; con el total. Las ordenes marcadas quedan asociadas a ese asiento.
              </p>
            </>
          )}
        </div>
      )}

      {showForm && <NewOrderDialog fecha={fecha} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void load(); }} />}
    </div>
  );
}

function Kpi({ color, label, value }: { color: 'amber' | 'blue' | 'violet' | 'emerald'; label: string; value: React.ReactNode }) {
  const cls: Record<typeof color, string> = {
    amber: 'text-amber-600 dark:text-amber-400',
    blue: 'text-blue-600 dark:text-blue-400',
    violet: 'text-violet-600 dark:text-violet-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
  };
  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-2xl font-extrabold tabular-nums mt-1 ${cls[color]}`}>{value}</p>
    </div>
  );
}

function NewOrderDialog({ fecha, onClose, onSaved }: { fecha: string; onClose: () => void; onSaved: () => void }) {
  const [bookings, setBookings] = useState<Array<{ id: number; codigo: string; huespedes: number; room_numero: string; customer_nombre: string }>>([]);
  const [bookingId, setBookingId] = useState<number>(0);
  const [cantidad, setCantidad] = useState<number>(1);
  const [precio, setPrecio] = useState<number>(BREAKFAST_PRICE);
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { void activeBookingsToday(fecha).then((r) => { setBookings(r); if (r.length && !bookingId) { setBookingId(r[0]!.id); setCantidad(r[0]!.huespedes); } }); }, [fecha]);

  const selBooking = useMemo(() => bookings.find((b) => b.id === bookingId), [bookings, bookingId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!bookingId) { setError('Selecciona una reserva'); return; }
    if (cantidad < 0) { setError('Cantidad invalida'); return; }
    setSubmitting(true);
    try {
      await upsertOrder({ booking_id: bookingId, fecha, cantidad, precio_unitario: precio, notas: notas.trim() || null });
      toast.success('Desayuno registrado');
      onSaved();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Error';
      setError(m); toast.error(m);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Desayuno del {fecha}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>
        {bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay reservas activas para esta fecha.</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Reserva</label>
              <select value={bookingId} onChange={(e) => { const id = Number(e.target.value); setBookingId(id); const b = bookings.find((x) => x.id === id); if (b) setCantidad(b.huespedes); }} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer">
                <option value={0}>— Selecciona —</option>
                {bookings.map((b) => <option key={b.id} value={b.id}>Hab. {b.room_numero} — {b.customer_nombre} ({b.codigo}, {b.huespedes} huesp.)</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Cantidad</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setCantidad((c) => Math.max(0, c - 1))} className="h-11 w-11 rounded-xl border border-border bg-card font-bold text-lg hover:bg-muted">−</button>
                  <input type="number" min={0} value={cantidad} onChange={(e) => setCantidad(Math.max(0, Number(e.target.value)))} className="flex-1 h-11 px-3 rounded-xl border border-border bg-muted/50 text-center font-bold text-lg" />
                  <button type="button" onClick={() => setCantidad((c) => c + 1)} className="h-11 w-11 rounded-xl border border-border bg-card font-bold text-lg hover:bg-muted">+</button>
                </div>
                {selBooking && <p className="text-[10px] text-muted-foreground mt-1">Huéspedes en la habitación: {selBooking.huespedes}</p>}
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Precio unitario (EUR)</label>
                <input type="number" min={0} step="0.01" value={precio} onChange={(e) => setPrecio(Number(e.target.value))} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Notas (alergias, preferencias, hora deseada...)</label>
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm" />
            </div>
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-sm">
              Total: <span className="font-extrabold tabular-nums">{formatCurrency(cantidad * precio, 'EUR')}</span>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 font-medium">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={submitting} className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 disabled:opacity-60">
                {submitting ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
