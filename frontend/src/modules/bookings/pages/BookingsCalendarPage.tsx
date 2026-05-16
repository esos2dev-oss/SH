import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CaretLeft, CaretRight, ListBullets } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { calendarBookings, type Booking } from '../api/bookings.api';
import { BookingStatusBadge } from '../../../shared/components/ui/StatusBadge';

function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function sameDay(a: Date, b: Date): boolean { return a.toDateString() === b.toDateString(); }

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export default function BookingsCalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

  async function load() {
    setLoading(true);
    try {
      // Cargar margen de un mes antes y un mes despues
      const from = startOfMonth(addMonths(cursor, -1));
      const to = endOfMonth(addMonths(cursor, 1));
      const data = await calendarBookings(iso(from), iso(to));
      setBookings(data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [cursor]);

  // Generar grid del mes (lunes-domingo)
  const cells = useMemo(() => {
    const result: Date[] = [];
    const firstDay = monthStart.getDay() === 0 ? 6 : monthStart.getDay() - 1; // lunes=0
    const start = new Date(monthStart);
    start.setDate(start.getDate() - firstDay);
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      result.push(d);
    }
    return result;
  }, [monthStart]);

  function bookingsForDay(d: Date): Booking[] {
    return bookings.filter((b) => {
      const entrada = new Date(b.fecha_entrada);
      const salida = new Date(b.fecha_salida);
      return entrada <= d && salida > d;
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendario de reservas"
        subtitle={`${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`}
        actions={
          <>
            <button type="button" onClick={() => setCursor(addMonths(cursor, -1))} className="h-9 w-9 border border-border bg-card rounded-lg hover:bg-muted flex items-center justify-center"><CaretLeft size={14} weight="bold" /></button>
            <button type="button" onClick={() => setCursor(new Date())} className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted">Hoy</button>
            <button type="button" onClick={() => setCursor(addMonths(cursor, 1))} className="h-9 w-9 border border-border bg-card rounded-lg hover:bg-muted flex items-center justify-center"><CaretRight size={14} weight="bold" /></button>
            <Link to="/bookings" className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"><ListBullets size={12} weight="bold" /> Lista</Link>
          </>
        }
      />

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>
      ) : (
        <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b">
            {DAYS.map((d, i) => <div key={i} className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, idx) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = sameDay(d, new Date());
              const dayBookings = bookingsForDay(d);
              return (
                <div key={idx} className={`min-h-[100px] p-1.5 border-b border-r ${inMonth ? '' : 'bg-muted/20'}`}>
                  <div className={`text-xs font-bold ${isToday ? 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground' : inMonth ? '' : 'text-muted-foreground'}`}>
                    {d.getDate()}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {dayBookings.slice(0, 3).map((b) => (
                      <Link key={b.id} to={`/bookings/${b.id}`} className="block text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary truncate hover:bg-primary/20">
                        {b.room.numero}: {b.customer.nombre.split(' ')[0]}
                      </Link>
                    ))}
                    {dayBookings.length > 3 && <p className="text-[10px] text-muted-foreground">+{dayBookings.length - 3} mas</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Mostrando {bookings.filter((b) => {
          const entrada = new Date(b.fecha_entrada);
          return entrada >= monthStart && entrada <= monthEnd;
        }).length} reservas con entrada en {MONTHS[cursor.getMonth()]}.
        <span className="ml-2"><BookingStatusBadge status="confirmada" /> activas y pendientes</span>
      </div>
    </div>
  );
}
