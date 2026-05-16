// Vista de check-out / detalle del check-in.

import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, Eye } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { getBooking, type Booking } from '../../bookings/api/bookings.api';
import { getCheckIn, checkOut, documentoUrl, type CheckIn } from '../api/check-ins.api';
import { formatDateTime } from '../../../shared/lib/format';

export default function CheckOutPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [loading, setLoading] = useState(true);
  const [observaciones, setObservaciones] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    void Promise.all([getBooking(Number(bookingId)), getCheckIn(Number(bookingId))])
      .then(([b, ci]) => { setBooking(b); setCheckIn(ci); })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Error'))
      .finally(() => setLoading(false));
  }, [bookingId]);

  async function viewDocumento() {
    if (!bookingId) return;
    try {
      const r = await documentoUrl(Number(bookingId));
      window.open(r.url, '_blank');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!booking) return;
    if (booking.status !== 'en_curso') {
      toast.error(`No se puede hacer check-out en reserva ${booking.status}`);
      return;
    }
    setSubmitting(true);
    try {
      await checkOut(booking.id, observaciones.trim() || null);
      toast.success('Check-out completado. Habitacion en limpieza.');
      navigate(`/bookings/${booking.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>;
  if (!booking) return <div className="text-center py-12">Reserva no encontrada</div>;
  if (!checkIn) return (
    <div className="space-y-4 max-w-2xl">
      <Link to={`/bookings/${booking.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Volver</Link>
      <p>No hay check-in registrado para esta reserva.</p>
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <Link to={`/bookings/${booking.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Volver a la reserva</Link>

      <PageHeader title="Check-in / check-out" subtitle={`Reserva ${booking.codigo} · Hab. ${booking.room.numero}`} />

      <div className="bg-card rounded-3xl border border-border shadow-sm p-6">
        <h3 className="font-semibold mb-3">Detalle del check-in</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Hora entrada" value={formatDateTime(checkIn.hora_entrada)} />
          <Field label="Hora salida" value={checkIn.hora_salida ? formatDateTime(checkIn.hora_salida) : '— pendiente —'} />
          <Field label="Registrado por" value={`Usuario #${checkIn.registered_by}`} />
          {checkIn.observaciones && <div className="col-span-2"><Field label="Observaciones" value={checkIn.observaciones} /></div>}
        </div>
        {checkIn.documento_url && (
          <button type="button" onClick={() => void viewDocumento()} className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary font-semibold hover:underline">
            <Eye size={14} /> Ver documento de identidad
          </button>
        )}
      </div>

      {!checkIn.hora_salida && booking.status === 'en_curso' && (
        <form onSubmit={onSubmit} className="bg-card rounded-3xl border border-border shadow-sm p-6 space-y-4">
          <h3 className="font-semibold">Confirmar check-out</h3>
          {booking.importe_pendiente > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm text-amber-700 dark:text-amber-400">
              <strong>Atencion:</strong> hay {booking.importe_pendiente} {booking.moneda} pendientes de pago.
            </div>
          )}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Observaciones de salida</label>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" placeholder="Estado de la habitacion, cargos extras, etc." />
          </div>
          <button type="submit" disabled={submitting} className="h-11 px-6 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 shadow-lg shadow-blue-600/20 disabled:opacity-60 flex items-center gap-2">
            <CheckCircle size={16} weight="bold" />
            {submitting ? 'Procesando...' : 'Confirmar check-out'}
          </button>
        </form>
      )}
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
