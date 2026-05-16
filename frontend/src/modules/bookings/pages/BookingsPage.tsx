import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, ArrowClockwise, CalendarBlank, MagnifyingGlass } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { BookingStatusBadge, PaymentStatusBadge } from '../../../shared/components/ui/StatusBadge';
import { listBookings, type Booking, type BookingStatus } from '../api/bookings.api';
import { BookingFormDialog } from '../components/BookingFormDialog';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';

const STATUS_OPTIONS: Array<{ value: BookingStatus | ''; label: string }> = [
  { value: '', label: 'Todos los estados' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'confirmada', label: 'Confirmadas' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'finalizada', label: 'Finalizadas' },
  { value: 'cancelada', label: 'Canceladas' },
  { value: 'no_show', label: 'No-show' },
];

export default function BookingsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params: { status?: BookingStatus; search?: string; limit: number } = { limit: 100 };
      if (status) params.status = status;
      if (search) params.search = search;
      const r = await listBookings(params);
      setItems(r.data);
      setTotal(r.pagination.total);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [status]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservas"
        subtitle={`${total} reservas registradas`}
        actions={
          <>
            <Link to="/bookings/calendar" className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"><CalendarBlank size={12} weight="bold" /> Calendario</Link>
            <button type="button" onClick={() => void load()} className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"><ArrowClockwise size={12} weight="bold" /> Refrescar</button>
            <button type="button" onClick={() => setShowForm(true)} className="h-9 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm shadow-primary/20 flex items-center gap-1.5"><Plus size={12} weight="bold" /> Nueva reserva</button>
          </>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="Buscar por codigo, huesped o habitacion..." className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | '')} className="h-10 px-3 rounded-xl border border-border bg-card text-sm cursor-pointer outline-none focus:border-primary">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Cargando...</div>
        ) : items.length === 0 ? (
          <EmptyState icon={CalendarBlank} title="Sin reservas" description="Aun no se han registrado reservas." action={
            <button type="button" onClick={() => setShowForm(true)} className="h-9 px-4 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">Crear primera reserva</button>
          } />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Codigo</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Huesped</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Habitacion</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Periodo</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Estado</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pago</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => navigate(`/bookings/${b.id}`)}>
                    <td className="px-5 py-3 font-bold">{b.codigo}</td>
                    <td className="px-5 py-3">{b.customer.nombre}</td>
                    <td className="px-5 py-3 text-muted-foreground">Hab. {b.room.numero} · {b.room.type}</td>
                    <td className="px-5 py-3 text-muted-foreground text-[12px]">{formatDateTime(b.fecha_entrada)}<br />{formatDateTime(b.fecha_salida)}</td>
                    <td className="px-5 py-3 font-semibold tabular-nums">{formatCurrency(b.importe_total, b.moneda)}</td>
                    <td className="px-5 py-3"><BookingStatusBadge status={b.status} /></td>
                    <td className="px-5 py-3"><PaymentStatusBadge status={b.payment_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <BookingFormDialog onClose={() => setShowForm(false)} onSaved={(id) => { setShowForm(false); navigate(`/bookings/${id}`); }} />}
    </div>
  );
}
