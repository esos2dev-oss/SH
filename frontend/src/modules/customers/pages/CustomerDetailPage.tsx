import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, EnvelopeSimple, Phone, IdentificationCard, Calendar, Globe } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { getCustomer, getCustomerTimeline, type Customer, type CustomerTimeline } from '../api/customers.api';
import { formatCurrency, formatDate, formatDateTime } from '../../../shared/lib/format';
import { BookingStatusBadge } from '../../../shared/components/ui/StatusBadge';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [timeline, setTimeline] = useState<CustomerTimeline | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void Promise.all([getCustomer(Number(id)), getCustomerTimeline(Number(id))])
      .then(([c, t]) => { setCustomer(c); setTimeline(t); })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Error'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>;
  if (!customer) return <div className="text-center py-12">No encontrado</div>;

  const initials = customer.nombres.split(' ').map((w) => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 1) +
    customer.apellidos.split(' ').map((w) => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 1);

  return (
    <div className="space-y-6 max-w-5xl">
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Volver a huespedes</Link>

      <PageHeader title={`${customer.nombres} ${customer.apellidos}`} subtitle={`${customer.total_estancias} estancias · ${formatCurrency(customer.total_gastado)}`} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card rounded-3xl border border-border shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-extrabold">{initials}</div>
            <div>
              <p className="text-sm font-bold">{customer.nombres} {customer.apellidos}</p>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{customer.doc_kind} {customer.doc_numero}</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {customer.email && <div className="flex items-center gap-2 text-muted-foreground"><EnvelopeSimple size={14} /> {customer.email}</div>}
            {customer.telefono && <div className="flex items-center gap-2 text-muted-foreground"><Phone size={14} /> {customer.telefono}</div>}
            {customer.nacionalidad && <div className="flex items-center gap-2 text-muted-foreground"><Globe size={14} /> {customer.nacionalidad}</div>}
            {customer.fecha_nacimiento && <div className="flex items-center gap-2 text-muted-foreground"><Calendar size={14} /> {formatDate(customer.fecha_nacimiento)}</div>}
            <div className="flex items-center gap-2 text-muted-foreground"><IdentificationCard size={14} /> Marketing: {customer.accepts_marketing ? 'Si' : 'No'}</div>
          </div>
          {customer.notas && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Notas internas</p>
              <p className="text-sm">{customer.notas}</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-card rounded-3xl border border-border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Historial de estancias</h3>
          {!timeline || timeline.bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin estancias registradas.</p>
          ) : (
            <div className="space-y-2">
              {timeline.bookings.map((b) => (
                <Link key={b.id} to={`/bookings/${b.id}`} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm">{b.codigo}</p>
                      <BookingStatusBadge status={b.status as never} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(b.fecha_entrada)} — {formatDateTime(b.fecha_salida)} · Hab. {b.room_numero}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums text-sm">{formatCurrency(Number(b.importe_total))}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {timeline && timeline.emails.length > 0 && (
        <div className="bg-card rounded-3xl border border-border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Emails enviados</h3>
          <div className="space-y-2">
            {timeline.emails.slice(0, 10).map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                <EnvelopeSimple size={18} weight="duotone" className="text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{e.asunto}</p>
                  <p className="text-[11px] text-muted-foreground">{e.event} · {formatDateTime(e.created_at)}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${e.status === 'enviado' || e.status === 'entregado' || e.status === 'abierto' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{e.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
