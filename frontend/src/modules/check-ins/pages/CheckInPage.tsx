// Flow de check-in para una reserva. Tras crear, redirige a detalle de booking.

import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ClipboardText, ArrowLeft, FileImage, FilePdf } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { getBooking, type Booking } from '../../bookings/api/bookings.api';
import { createCheckIn } from '../api/check-ins.api';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { BookingStatusBadge, PaymentStatusBadge } from '../../../shared/components/ui/StatusBadge';

export default function CheckInPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [observaciones, setObservaciones] = useState('');
  const [documento, setDocumento] = useState<File | null>(null);
  const [firma, setFirma] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    void getBooking(Number(bookingId))
      .then(setBooking)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Error'))
      .finally(() => setLoading(false));
  }, [bookingId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!booking) return;
    if (!['pendiente', 'confirmada'].includes(booking.status)) {
      toast.error(`No se puede hacer check-in en reserva ${booking.status}`);
      return;
    }
    setSubmitting(true);
    try {
      await createCheckIn({
        booking_id: booking.id,
        observaciones: observaciones.trim() || null,
        documento: documento ?? undefined,
        firma: firma ?? undefined,
      });
      toast.success('Check-in registrado. Habitacion ocupada.');
      navigate(`/bookings/${booking.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>;
  if (!booking) return <div className="text-center py-12">Reserva no encontrada</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <Link to={`/bookings/${booking.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Volver a la reserva</Link>

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
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Firma (imagen, opcional)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFirma(e.target.files?.[0] ?? null)}
            className="block text-sm file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-secondary file:text-secondary-foreground file:font-semibold file:cursor-pointer hover:file:bg-secondary/80"
          />
          {firma && <p className="mt-2 text-xs text-muted-foreground">{firma.name}</p>}
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Observaciones</label>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" placeholder="Notas internas para recepcion (no visibles al huesped)" />
        </div>

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={submitting} className="h-11 px-6 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 disabled:opacity-60 flex items-center gap-2">
            <ClipboardText size={16} weight="bold" />
            {submitting ? 'Registrando...' : 'Confirmar check-in'}
          </button>
          <Link to={`/bookings/${booking.id}`} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted flex items-center">Cancelar</Link>
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
