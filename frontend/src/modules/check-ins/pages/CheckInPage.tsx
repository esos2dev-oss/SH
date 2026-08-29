// Flow de check-in expres. Si hay saldo pendiente, ofrece cobrar antes con QuickPayment.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ClipboardText, ArrowLeft, FileImage, FilePdf, CurrencyCircleDollar, Users, Plus, Trash } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { SignaturePad } from '../../../shared/components/ui/signature-pad';
import { getBooking, type Booking } from '../../bookings/api/bookings.api';
import { createCheckIn } from '../api/check-ins.api';
import { useQuickPayment, useOnPaymentSaved } from '../../payments/hooks/QuickPaymentProvider';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { BookingStatusBadge, PaymentStatusBadge } from '../../../shared/components/ui/StatusBadge';
import { useDialog } from '../../../shared/components/ui/dialog-system';

export default function CheckInPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const quickPay = useQuickPayment();
  const dialog = useDialog();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [observaciones, setObservaciones] = useState('');
  const [documento, setDocumento] = useState<File | null>(null);
  const [firma, setFirma] = useState<File | null>(null);
  const [acompaniantes, setAcompaniantes] = useState<Array<{ nombre: string; documento: string }>>([]);
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    if (!bookingId) return;
    try {
      const b = await getBooking(Number(bookingId));
      setBooking(b);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId) return;
    setLoading(true);
    void reload().finally(() => setLoading(false));
  }, [bookingId, reload]);

  useOnPaymentSaved(useCallback(() => { void reload(); }, [reload]));

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!booking) return;
    if (!['pendiente', 'confirmada'].includes(booking.status)) {
      toast.error(`No se puede hacer check-in en reserva ${booking.status}`);
      return;
    }
    // Confirmacion explicita si hay saldo pendiente — evita que recepcion
    // haga check-in sin darse cuenta del saldo.
    if (booking.importe_pendiente > 0) {
      const ok = await dialog.confirm({
        title: 'Saldo pendiente',
        message: `Esta reserva tiene un saldo pendiente de ${formatCurrency(booking.importe_pendiente, booking.moneda)}. Hacer check-in de todas formas?`,
        confirmLabel: 'Hacer check-in igual',
        danger: true,
      });
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const cleanAcomp = acompaniantes
        .filter((a) => a.nombre.trim())
        .map((a) => ({ nombre: a.nombre.trim(), documento: a.documento.trim() || null }));
      await createCheckIn({
        booking_id: booking.id,
        observaciones: observaciones.trim() || null,
        documento: documento ?? undefined,
        firma: firma ?? undefined,
        huespedes_acompaniantes: cleanAcomp.length > 0 ? cleanAcomp : undefined,
      });
      toast.success('Check-in registrado. Habitacion ocupada.');
      navigate(`/reservas/${booking.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>;
  if (!booking) return <div className="text-center py-12">Reserva no encontrada</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <Link to={`/reservas/${booking.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Volver a la reserva</Link>

      <PageHeader title="Check-in" subtitle={`Reserva ${booking.codigo}`} />

      <div className="bg-card rounded-3xl border border-border shadow-sm p-6">
        <h3 className="font-semibold mb-3">Resumen</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Huesped" value={booking.customer.nombre} />
          <Field label="Habitacion" value={`${booking.room.numero} · ${booking.room.type}`} />
          <Field label="Entrada" value={formatDateTime(booking.fecha_entrada)} />
          <Field label="Salida" value={formatDateTime(booking.fecha_salida)} />
          <Field label="Importe" value={formatCurrency(booking.importe_total, booking.moneda)} />
          <Field label="Pendiente" value={formatCurrency(booking.importe_pendiente, booking.moneda)} />
        </div>
        <div className="flex gap-2 mt-4">
          <BookingStatusBadge status={booking.status} />
          <PaymentStatusBadge status={booking.payment_status} />
        </div>

        {booking.importe_pendiente > 0 && (
          <div className="mt-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-300">Saldo pendiente: {formatCurrency(booking.importe_pendiente, booking.moneda)}</p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">Recomendado: cobrar antes del check-in.</p>
            </div>
            <button
              type="button"
              onClick={openQuickPay}
              className="h-9 px-3 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center gap-1.5 whitespace-nowrap"
            >
              <CurrencyCircleDollar size={14} weight="bold" /> Cobrar ahora
            </button>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="bg-card rounded-3xl border border-border shadow-sm p-6 space-y-4">
        <h3 className="font-semibold">Datos del check-in</h3>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Documento de identidad (foto/PDF)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setDocumento(e.target.files?.[0] ?? null)}
            className="block text-sm file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-semibold file:cursor-pointer hover:file:bg-primary/90"
          />
          {documento && (
            <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
              {documento.type === 'application/pdf' ? <FilePdf size={14} /> : <FileImage size={14} />}
              {documento.name} · {(documento.size / 1024).toFixed(0)} KB
            </p>
          )}
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Firma del huesped</label>
          <SignaturePad
            onSave={(blob) => {
              const file = new File([blob], `firma-${booking.codigo}.png`, { type: 'image/png' });
              setFirma(file);
            }}
            saveLabel="Confirmar firma"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Firma con el dedo o el mouse en el area de arriba. Si prefieres subir una imagen existente,{' '}
            <label className="text-primary cursor-pointer hover:underline">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setFirma(e.target.files?.[0] ?? null)}
              />
              elige archivo
            </label>.
          </p>
          {firma && <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">✓ Firma adjuntada</p>}
        </div>

        {booking.huespedes > 1 && (
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1 flex items-center gap-1.5">
              <Users size={12} weight="duotone" /> Acompañantes ({booking.huespedes - 1} esperado{booking.huespedes - 1 > 1 ? 's' : ''})
            </label>
            <div className="space-y-2">
              {acompaniantes.map((a, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={a.nombre}
                    onChange={(e) => setAcompaniantes(acompaniantes.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                    placeholder="Nombre completo"
                    className="flex-1 h-10 px-3 rounded-lg border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:bg-card"
                  />
                  <input
                    value={a.documento}
                    onChange={(e) => setAcompaniantes(acompaniantes.map((x, j) => j === i ? { ...x, documento: e.target.value } : x))}
                    placeholder="Documento (opcional)"
                    className="w-44 h-10 px-3 rounded-lg border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:bg-card"
                  />
                  <button type="button" onClick={() => setAcompaniantes(acompaniantes.filter((_, j) => j !== i))} className="p-2 rounded-lg hover:bg-red-50 text-red-600 dark:hover:bg-red-950/30" title="Quitar">
                    <Trash size={14} weight="bold" />
                  </button>
                </div>
              ))}
              {acompaniantes.length < booking.huespedes - 1 && (
                <button
                  type="button"
                  onClick={() => setAcompaniantes([...acompaniantes, { nombre: '', documento: '' }])}
                  className="h-9 px-3 text-xs font-semibold border border-dashed border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"
                >
                  <Plus size={12} weight="bold" /> Añadir acompañante
                </button>
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Captura los nombres de los acompañantes. El documento es opcional pero recomendado.</p>
          </div>
        )}

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Observaciones</label>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" placeholder="Notas internas para recepcion (no visibles al huesped)" />
        </div>

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={submitting} className="h-11 px-6 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 disabled:opacity-60 flex items-center gap-2">
            <ClipboardText size={16} weight="bold" />
            {submitting ? 'Registrando...' : 'Confirmar check-in'}
          </button>
          <Link to={`/reservas/${booking.id}`} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted flex items-center">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
