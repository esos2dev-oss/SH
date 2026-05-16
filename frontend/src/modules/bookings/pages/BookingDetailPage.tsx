import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardText, X, CurrencyDollar, CheckCircle, XCircle } from '@phosphor-icons/react';

import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { BookingStatusBadge, PaymentStatusBadge } from '../../../shared/components/ui/StatusBadge';
import {
  getBooking, listPayments, addPayment, confirmBooking, cancelBooking, noShowBooking,
  type Booking, type BookingPayment, type PaymentMethod,
} from '../api/bookings.api';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [payments, setPayments] = useState<BookingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const [b, ps] = await Promise.all([getBooking(Number(id)), listPayments(Number(id))]);
      setBooking(b);
      setPayments(ps);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [id]);

  async function transition(action: 'confirm' | 'cancel' | 'no-show') {
    if (!booking) return;
    try {
      if (action === 'confirm') await confirmBooking(booking.id);
      else if (action === 'cancel') {
        const reason = prompt('Motivo de la cancelacion?');
        if (!reason) return;
        await cancelBooking(booking.id, reason);
      } else if (action === 'no-show') {
        if (!confirm('Marcar como no-show?')) return;
        await noShowBooking(booking.id);
      }
      toast.success('Estado actualizado');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>;
  if (!booking) return <div className="text-center py-12">No encontrado</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <Link to="/bookings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Volver a reservas</Link>

      <PageHeader
        title={booking.codigo}
        subtitle={`${booking.customer.nombre} · Hab. ${booking.room.numero} · ${booking.room.type}`}
        actions={
          <>
            <BookingStatusBadge status={booking.status} className="!text-sm !px-3 !py-1" />
            {booking.status === 'pendiente' && (
              <button type="button" onClick={() => void transition('confirm')} className="h-9 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm shadow-primary/20 flex items-center gap-1.5"><CheckCircle size={12} weight="bold" /> Confirmar</button>
            )}
            {(booking.status === 'pendiente' || booking.status === 'confirmada') && (
              <button type="button" onClick={() => void transition('cancel')} className="h-9 px-3 text-xs font-semibold border border-red-200 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 flex items-center gap-1.5"><XCircle size={12} weight="bold" /> Cancelar</button>
            )}
            {booking.status === 'confirmada' && (
              <button type="button" onClick={() => navigate(`/check-ins/new/${booking.id}`)} className="h-9 px-3 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 flex items-center gap-1.5"><ClipboardText size={12} weight="bold" /> Hacer check-in</button>
            )}
            {booking.status === 'en_curso' && (
              <button type="button" onClick={() => navigate(`/check-ins/${booking.id}`)} className="h-9 px-3 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm shadow-blue-600/20 flex items-center gap-1.5">Check-out</button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Resumen importes */}
        <div className="bg-card rounded-3xl border border-border shadow-sm p-6">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Importe total</h3>
          <p className="text-3xl font-extrabold tabular-nums">{formatCurrency(booking.importe_total, booking.moneda)}</p>
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Tarifa</span><span className="tabular-nums">{formatCurrency(booking.tarifa_aplicada, booking.moneda)}</span></div>
            {booking.descuento_pct > 0 && <div className="flex justify-between text-emerald-600"><span>Descuento {booking.descuento_pct}%</span></div>}
            {booking.descuento_monto > 0 && <div className="flex justify-between text-emerald-600"><span>Desc. fijo</span><span className="tabular-nums">-{formatCurrency(booking.descuento_monto, booking.moneda)}</span></div>}
            <div className="flex justify-between border-t pt-2 mt-2"><span className="text-muted-foreground">Pagado</span><span className="tabular-nums font-semibold">{formatCurrency(booking.importe_pagado, booking.moneda)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Pendiente</span><span className="tabular-nums font-semibold">{formatCurrency(booking.importe_pendiente, booking.moneda)}</span></div>
          </div>
          <PaymentStatusBadge status={booking.payment_status} className="mt-3" />
        </div>

        {/* Datos */}
        <div className="lg:col-span-2 bg-card rounded-3xl border border-border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Detalle</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <Field label="Periodo" value={booking.period} />
            <Field label="Huespedes" value={String(booking.huespedes)} />
            <Field label="Entrada" value={formatDateTime(booking.fecha_entrada)} />
            <Field label="Salida" value={formatDateTime(booking.fecha_salida)} />
            <Field label="Origen" value={booking.origen} />
            <Field label="Creada" value={formatDateTime(booking.created_at)} />
            <div className="sm:col-span-2">
              <Field label="Huesped" value={
                <Link to={`/customers/${booking.customer.id}`} className="text-primary hover:underline">{booking.customer.nombre}</Link>
              } />
            </div>
            {booking.notas && <div className="sm:col-span-2"><Field label="Notas" value={booking.notas} /></div>}
            {booking.cancelled_reason && <div className="sm:col-span-2"><Field label="Motivo cancelacion" value={booking.cancelled_reason} /></div>}
          </div>
        </div>
      </div>

      {/* Pagos */}
      <div className="bg-card rounded-3xl border border-border shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Pagos</h3>
          {booking.importe_pendiente > 0 && booking.status !== 'cancelada' && (
            <button type="button" onClick={() => setShowPay(true)} className="h-9 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm shadow-primary/20 flex items-center gap-1.5"><CurrencyDollar size={12} weight="bold" /> Registrar pago</button>
          )}
        </div>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin pagos registrados.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-border">
                <div>
                  <p className="font-semibold tabular-nums">{formatCurrency(Number(p.monto), p.moneda)}</p>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                    {p.method}{p.referencia ? ` · ${p.referencia}` : ''}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{formatDateTime(p.pagado_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {showPay && booking && (
        <PaymentDialog
          maxMonto={booking.importe_pendiente}
          moneda={booking.moneda}
          onClose={() => setShowPay(false)}
          onSaved={async (data) => {
            try {
              await addPayment(booking.id, data);
              toast.success('Pago registrado');
              setShowPay(false);
              await load();
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : 'Error');
            }
          }}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}

function PaymentDialog({ maxMonto, moneda, onClose, onSaved }: {
  maxMonto: number;
  moneda: string;
  onClose: () => void;
  onSaved: (data: { monto: number; method: PaymentMethod; referencia?: string | null; notas?: string | null }) => Promise<void>;
}) {
  const [monto, setMonto] = useState(maxMonto);
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (monto <= 0 || monto > maxMonto + 0.01) {
      toast.error(`Monto invalido. Maximo: ${maxMonto}`);
      return;
    }
    setSubmitting(true);
    await onSaved({ monto, method, referencia: referencia || null, notas: notas || null });
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Registrar pago</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Monto ({moneda})</label>
            <input type="number" step="0.01" max={maxMonto} value={monto} onChange={(e) => setMonto(Number(e.target.value))} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" />
            <p className="text-[11px] text-muted-foreground mt-1">Maximo pendiente: {formatCurrency(maxMonto, moneda)}</p>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Metodo</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer outline-none focus:border-primary focus:bg-card">
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="paypal">PayPal</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Referencia</label>
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" placeholder="TXN12345 o comprobante #..." />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Notas</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-60">{submitting ? 'Guardando...' : 'Confirmar pago'}</button>
            <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
