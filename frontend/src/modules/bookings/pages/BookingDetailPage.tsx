import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardText, CurrencyDollar, CheckCircle, XCircle, Check, X, Paperclip, Eye } from '@phosphor-icons/react';

import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { BookingStatusBadge, PaymentStatusBadge } from '../../../shared/components/ui/StatusBadge';
import {
  getBooking, confirmBooking, cancelBooking, noShowBooking,
  type Booking,
} from '../api/bookings.api';
import {
  listPayments, confirmPayment, rejectPayment, updatePayment,
  type PaymentPublic,
} from '../../payments/api/payments.api';
import { ReceiptUploader } from '../../payments/components/ReceiptUploader';
import { useQuickPayment, useOnPaymentSaved } from '../../payments/hooks/QuickPaymentProvider';
import { METHOD_LABELS, STATUS_COLORS, STATUS_LABELS } from '../../payments/lib/labels';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { cn } from '../../../shared/lib/cn';
import { useDialog } from '../../../shared/components/ui/dialog-system';

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const quickPay = useQuickPayment();
  const dialog = useDialog();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [payments, setPayments] = useState<PaymentPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const bookingId = Number(id);
      const [b, ps] = await Promise.all([
        getBooking(bookingId),
        listPayments({ booking_id: bookingId, limit: 50 }),
      ]);
      setBooking(b);
      setPayments(ps.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useOnPaymentSaved(useCallback(() => { void load(); }, [load]));

  async function transition(action: 'confirm' | 'cancel' | 'no-show') {
    if (!booking) return;
    try {
      if (action === 'confirm') await confirmBooking(booking.id);
      else if (action === 'cancel') {
        const reason = await dialog.prompt({
          title: 'Cancelar reserva?',
          message: 'Indica el motivo de la cancelacion. Quedara registrado en el historial.',
          placeholder: 'Ej: cliente pidio cancelacion',
          required: true,
          multiline: true,
          maxLength: 500,
          confirmLabel: 'Cancelar reserva',
        });
        if (!reason) return;
        await cancelBooking(booking.id, reason);
      } else if (action === 'no-show') {
        if (!(await dialog.confirm({
          title: 'Marcar como no-show?',
          message: 'El huesped no se presento. La reserva quedara como no-show y la habitacion liberada.',
          danger: true,
          confirmLabel: 'Marcar no-show',
        }))) return;
        await noShowBooking(booking.id);
      }
      toast.success('Estado actualizado');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  async function handleConfirmPayment(p: PaymentPublic) {
    try {
      await confirmPayment(p.id);
      toast.success('Pago confirmado');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  async function handleRejectPayment(p: PaymentPublic) {
    const reason = await dialog.prompt({
      title: 'Rechazar pago',
      message: 'Indica el motivo del rechazo.',
      placeholder: 'Ej: referencia no encontrada',
      required: true,
      multiline: true,
      maxLength: 500,
    });
    if (!reason) return;
    try {
      await rejectPayment(p.id, reason);
      toast.success('Pago rechazado');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  function openQuickPay() {
    if (!booking) return;
    quickPay.open({
      booking_id: booking.id,
      monto: booking.importe_pendiente,
      moneda: booking.moneda,
      preselected: {
        kind: 'booking',
        booking_id: booking.id,
        customer_id: booking.customer.id,
        label: `Reserva ${booking.codigo} · Hab. ${booking.room.numero} · ${booking.customer.nombre}`,
        hint: `Pendiente: ${booking.importe_pendiente.toFixed(2)} ${booking.moneda}`,
        importe_pendiente: booking.importe_pendiente,
        moneda: booking.moneda,
      },
    });
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
            {booking.vehicle_plate && (
              <Field label="Placa vehiculo" value={<span className="font-mono font-semibold">{booking.vehicle_plate}</span>} />
            )}
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
            <button type="button" onClick={openQuickPay} className="h-9 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm shadow-primary/20 flex items-center gap-1.5"><CurrencyDollar size={12} weight="bold" /> Registrar pago <span className="ml-1 inline-flex items-center justify-center bg-primary-foreground/20 rounded px-1 text-[9px] font-mono">P</span></button>
          )}
        </div>
        {payments.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-sm text-muted-foreground">Sin pagos registrados.</p>
            {booking.status !== 'cancelada' && booking.importe_pendiente > 0 && (
              <button type="button" onClick={openQuickPay} className="inline-flex items-center gap-1.5 h-9 px-4 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
                <CurrencyDollar size={14} weight="bold" /> Registrar primer pago
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold tabular-nums">{formatCurrency(Number(p.monto), p.moneda)}{p.monto_base !== null && p.moneda !== 'USD' ? <span className="ml-2 text-xs text-muted-foreground">({p.monto_base.toFixed(2)} USD)</span> : null}</p>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                      {METHOD_LABELS[p.method]}{p.referencia ? ` · ref ${p.referencia}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.receipt_url ? (
                      <a href={p.receipt_url} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-primary/10 text-primary" title="Ver comprobante"><Eye size={14} weight="bold" /></a>
                    ) : (
                      <button type="button" onClick={() => setUploadingFor(p.id === uploadingFor ? null : p.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Adjuntar comprobante"><Paperclip size={14} weight="bold" /></button>
                    )}
                    <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded', STATUS_COLORS[p.status])}>{STATUS_LABELS[p.status]}</span>
                    {p.status === 'pending_confirmation' && (
                      <>
                        <button type="button" onClick={() => void handleConfirmPayment(p)} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600 dark:hover:bg-emerald-950/30" title="Confirmar"><Check size={14} weight="bold" /></button>
                        <button type="button" onClick={() => void handleRejectPayment(p)} className="p-1.5 rounded hover:bg-red-50 text-red-600 dark:hover:bg-red-950/30" title="Rechazar"><X size={14} weight="bold" /></button>
                      </>
                    )}
                    <p className="text-xs text-muted-foreground ml-2 whitespace-nowrap">{formatDateTime(p.pagado_at)}</p>
                  </div>
                </div>
                {uploadingFor === p.id && !p.receipt_url && (
                  <ReceiptUploader
                    value={null}
                    mime={null}
                    onChange={async (url, mime) => {
                      if (!url) return;
                      try {
                        await updatePayment(p.id, { receipt_url: url, receipt_mime: mime });
                        toast.success('Comprobante adjuntado');
                        setUploadingFor(null);
                        await load();
                      } catch (err) {
                        toast.error(err instanceof ApiError ? err.message : 'Error');
                      }
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
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
