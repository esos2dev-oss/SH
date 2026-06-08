// Panel del dia: 3 columnas (Hoy / Tablero / Inbox) + KPIs.

import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Bed, CalendarCheck, DoorOpen, Broom, Cake,
  CurrencyCircleDollar, WarningCircle, ArrowsClockwise, Phone,
  Plus, UserPlus, ClipboardText, Stack, ChartLineUp, CalendarBlank,
  type IconProps,
} from '@phosphor-icons/react';
import { useAuth } from '../../../contexts/AuthContext';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import {
  getDashboardToday, getOccupancyExtras,
  type DashboardPayload, type OccupancyExtras,
  type ArrivalToday,
  type DepartureToday,
  type CleaningPending,
  type BirthdayToday,
  type PendingPaymentItem,
  type BookingWithoutPaymentItem,
  type RoomBoardItem,
} from '../api/dashboard.api';
import { BookingFormDialog } from '../../bookings/components/BookingFormDialog';
import { useQuickPayment, useOnPaymentSaved } from '../../payments/hooks/QuickPaymentProvider';
import { METHOD_LABELS } from '../../payments/lib/labels';
import type { PaymentMethod } from '../../payments/api/payments.api';
import { confirmPayment, rejectPayment } from '../../payments/api/payments.api';
import { useDialog } from '../../../shared/components/ui/dialog-system';
import { formatCurrency } from '../../../shared/lib/format';
import { cn } from '../../../shared/lib/cn';

type IconType = ComponentType<IconProps>;

const ROOM_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  disponible: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', label: 'Disponible' },
  ocupada: { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', label: 'Ocupada' },
  limpieza: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', label: 'Limpieza' },
  mantenimiento: { bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-300', label: 'Mant.' },
  fuera_servicio: { bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300', label: 'Fuera' },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const quickPay = useQuickPayment();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [occupancyExtras, setOccupancyExtras] = useState<OccupancyExtras | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBookingForm, setShowBookingForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, occ] = await Promise.all([
        getDashboardToday(),
        getOccupancyExtras().catch(() => null), // no critico: si falla, no rompe el panel
      ]);
      setData(r);
      setOccupancyExtras(occ);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error cargando el panel');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useOnPaymentSaved(useCallback(() => { void load(); }, [load]));

  const today = new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hola, ${user?.nombre.split(' ')[0] ?? ''}`}
        subtitle={today}
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"
            title="Actualizar"
          >
            <ArrowsClockwise size={12} weight="bold" className={cn(loading && 'animate-spin')} />
            Actualizar
          </button>
        }
      />

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <QuickAction icon={Plus} label="Nueva reserva" onClick={() => setShowBookingForm(true)} primary />
        <QuickAction icon={CurrencyCircleDollar} label="Registrar pago" onClick={() => quickPay.open()} />
        <QuickAction icon={UserPlus} label="Nuevo huesped" onClick={() => navigate('/customers')} />
        <QuickAction icon={ClipboardText} label="Reservas" onClick={() => navigate('/bookings')} />
        <QuickAction icon={Stack} label="Cierre caja" onClick={() => navigate('/payments/cash-closure')} />
        <QuickAction icon={ChartLineUp} label="Reportes" onClick={() => navigate('/reports')} />
      </div>

      {/* KPIs operativos */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <Kpi icon={CalendarCheck} label="Llegadas hoy" value={data.kpis.arrivals_count} />
          <Kpi icon={DoorOpen} label="Salidas hoy" value={data.kpis.departures_count} />
          <Kpi icon={Bed} label="Ocupacion hoy" value={`${data.kpis.occupancy_pct}%`} sub={`${data.kpis.rooms_occupied}/${data.kpis.rooms_total}`} />
          <Kpi icon={Broom} label="Limpiezas" value={data.kpis.cleanings_pending_count} amber={data.kpis.cleanings_pending_count > 0} />
          <Kpi icon={CurrencyCircleDollar} label="Pagos pendientes" value={data.kpis.pending_payments_count} amber={data.kpis.pending_payments_count > 0} />
        </div>
      )}

      {/* Ocupacion mes / anio */}
      {occupancyExtras && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OccupancyCard
            icon={CalendarBlank}
            title="Ocupacion del mes"
            pct={occupancyExtras.month.occupancyPct}
            sub={`Ingresos ${formatCurrency(occupancyExtras.month.revenue)}`}
          />
          <OccupancyCard
            icon={ChartLineUp}
            title="Ocupacion del anio"
            pct={occupancyExtras.year.occupancyPct}
            sub={`Ingresos ${formatCurrency(occupancyExtras.year.revenue)}`}
          />
        </div>
      )}

      {loading && !data ? (
        <p className="text-center py-12 text-sm text-muted-foreground">Cargando panel…</p>
      ) : !data ? null : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Columna izquierda: Hoy */}
          <div className="lg:col-span-3 space-y-4">
            <Section title="Llegadas" icon={CalendarCheck} count={data.today.arrivals.length}>
              {data.today.arrivals.length === 0 ? (
                <EmptyHint text="Sin llegadas previstas" />
              ) : (
                data.today.arrivals.map((a) => <ArrivalCard key={a.booking_id} item={a} onPay={() => quickPay.open({
                  booking_id: a.booking_id,
                  monto: a.importe_pendiente,
                  moneda: a.moneda,
                  preselected: {
                    kind: 'booking',
                    booking_id: a.booking_id,
                    customer_id: a.customer_id,
                    label: `Reserva ${a.codigo} · Hab. ${a.room_numero} · ${a.customer_nombre}`,
                    hint: `Pendiente: ${a.importe_pendiente.toFixed(2)} ${a.moneda}`,
                    importe_pendiente: a.importe_pendiente,
                    moneda: a.moneda,
                  },
                })} />)
              )}
            </Section>

            <Section title="Salidas" icon={DoorOpen} count={data.today.departures.length}>
              {data.today.departures.length === 0 ? (
                <EmptyHint text="Sin salidas previstas" />
              ) : (
                data.today.departures.map((d) => <DepartureCard key={d.booking_id} item={d} />)
              )}
            </Section>

            <Section title="Limpiezas" icon={Broom} count={data.today.cleanings_pending.length}>
              {data.today.cleanings_pending.length === 0 ? (
                <EmptyHint text="Sin habitaciones en limpieza" />
              ) : (
                data.today.cleanings_pending.map((c) => <CleaningCard key={c.room_id} item={c} />)
              )}
            </Section>

            {data.today.birthdays.length > 0 && (
              <Section title="Cumpleanos" icon={Cake} count={data.today.birthdays.length}>
                {data.today.birthdays.map((b) => <BirthdayCard key={b.customer_id} item={b} />)}
              </Section>
            )}
          </div>

          {/* Columna central: Tablero de habitaciones */}
          <div className="lg:col-span-6 space-y-3">
            <Section title="Tablero de habitaciones" icon={Bed} count={data.rooms_board.length}>
              {data.rooms_board.length === 0 ? (
                <EmptyHint text="Sin habitaciones activas" />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {data.rooms_board.map((r) => <RoomCard key={r.room_id} item={r} />)}
                </div>
              )}
            </Section>
          </div>

          {/* Columna derecha: Inbox */}
          <div className="lg:col-span-3 space-y-4">
            <Section title="Pagos por confirmar" icon={CurrencyCircleDollar} count={data.inbox.pending_payments.length}>
              {data.inbox.pending_payments.length === 0 ? (
                <EmptyHint text="Todo conciliado" />
              ) : (
                data.inbox.pending_payments.map((p) => <PendingPaymentCard key={p.payment_id} item={p} onChanged={load} />)
              )}
            </Section>

            <Section title="Reservas sin pago (24h)" icon={WarningCircle} count={data.inbox.bookings_without_payment.length}>
              {data.inbox.bookings_without_payment.length === 0 ? (
                <EmptyHint text="Sin alertas" />
              ) : (
                data.inbox.bookings_without_payment.map((b) => <NoPaymentCard key={b.booking_id} item={b} />)
              )}
            </Section>
          </div>
        </div>
      )}

      {showBookingForm && (
        <BookingFormDialog
          onClose={() => setShowBookingForm(false)}
          onSaved={(bookingId) => {
            setShowBookingForm(false);
            void load();
            navigate(`/bookings/${bookingId}`);
          }}
        />
      )}
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick, primary }: { icon: IconType; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-16 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all border shadow-sm',
        primary
          ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90 shadow-primary/20'
          : 'bg-card text-foreground border-border hover:bg-muted/50',
      )}
    >
      <Icon size={20} weight="duotone" />
      <span className="text-[11px] font-bold">{label}</span>
    </button>
  );
}

function OccupancyCard({ icon: Icon, title, pct, sub }: { icon: IconType; title: string; pct: number; sub: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} weight="duotone" className="text-primary" />
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <div className="flex items-baseline gap-3">
        <p className="text-3xl font-extrabold tabular-nums">{pct}%</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}

// =============================================================================
// Subcomponentes
// =============================================================================

function Kpi({ icon: Icon, label, value, sub, amber }: { icon: IconType; label: string; value: string | number; sub?: string; amber?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-3 shadow-sm">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={14} weight="duotone" className={cn(amber && 'text-amber-600 dark:text-amber-400')} />
        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
      </div>
      <p className={cn('text-xl font-extrabold tabular-nums', amber && 'text-amber-600 dark:text-amber-400')}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground tabular-nums">{sub}</p>}
    </div>
  );
}

function Section({ title, icon: Icon, count, children }: { title: string; icon: IconType; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Icon size={14} weight="duotone" />
          <h3 className="text-xs font-bold uppercase tracking-wider">{title}</h3>
        </div>
        <span className="text-[10px] font-mono font-bold text-muted-foreground bg-background rounded px-1.5 py-0.5">{count}</span>
      </div>
      <div className="p-3 space-y-2 max-h-96 overflow-y-auto">{children}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground text-center py-4">{text}</p>;
}

function ArrivalCard({ item, onPay }: { item: ArrivalToday; onPay: () => void }) {
  const hora = new Date(item.fecha_entrada).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  return (
    <Link to={`/bookings/${item.booking_id}`} className="block rounded-lg border border-border bg-background p-2.5 hover:border-primary/40 hover:shadow-sm transition-all">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold tabular-nums">{hora}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Hab. {item.room_numero}</span>
      </div>
      <p className="text-sm font-semibold mt-1 truncate">{item.customer_nombre}</p>
      <p className="text-[11px] text-muted-foreground truncate">{item.codigo}</p>
      {item.importe_pendiente > 0 ? (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onPay(); }}
          className="mt-2 w-full text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-950/50 flex items-center justify-center gap-1"
        >
          Pendiente {formatCurrency(item.importe_pendiente, item.moneda)} · Cobrar →
        </button>
      ) : (
        <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 rounded px-2 py-1 text-center">
          Pagada
        </p>
      )}
    </Link>
  );
}

function DepartureCard({ item }: { item: DepartureToday }) {
  const hora = new Date(item.fecha_salida).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  return (
    <Link to={`/bookings/${item.booking_id}`} className="block rounded-lg border border-border bg-background p-2.5 hover:border-primary/40 hover:shadow-sm transition-all">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold tabular-nums">{hora}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Hab. {item.room_numero}</span>
      </div>
      <p className="text-sm font-semibold mt-1 truncate">{item.customer_nombre}</p>
      <p className="text-[11px] text-muted-foreground truncate">{item.codigo}</p>
      {item.importe_pendiente > 0 && (
        <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1 text-center">
          Saldo {formatCurrency(item.importe_pendiente, item.moneda)}
        </p>
      )}
    </Link>
  );
}

function CleaningCard({ item }: { item: CleaningPending }) {
  return (
    <Link to="/rooms" className="block rounded-lg border border-border bg-background p-2.5 hover:border-primary/40 transition-all">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Hab. {item.numero}</p>
        <p className="text-[11px] text-muted-foreground tabular-nums">{Math.floor(item.minutes_in_state / 60) > 0 ? `${Math.floor(item.minutes_in_state / 60)}h ` : ''}{item.minutes_in_state % 60}m</p>
      </div>
      {item.planta && <p className="text-[11px] text-muted-foreground">Planta {item.planta}</p>}
    </Link>
  );
}

function BirthdayCard({ item }: { item: BirthdayToday }) {
  return (
    <Link to={`/customers/${item.customer_id}`} className="block rounded-lg border border-border bg-background p-2.5 hover:border-primary/40 transition-all">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold truncate">{item.nombre}</p>
        <span className="text-[10px] font-bold bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300 rounded px-1.5">{item.edad} anos</span>
      </div>
      {item.telefono && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone size={9} />{item.telefono}</p>}
    </Link>
  );
}

function RoomCard({ item }: { item: RoomBoardItem }) {
  const style = ROOM_STATUS_STYLES[item.status] ?? ROOM_STATUS_STYLES.disponible!;
  const haUntil = item.current_booking
    ? new Date(item.current_booking.fecha_salida).toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' })
    : null;
  return (
    <Link
      to={item.current_booking ? `/bookings/${item.current_booking.id}` : `/rooms`}
      className={cn('block rounded-xl border border-border p-2.5 hover:shadow-md transition-all', style.bg)}
    >
      <div className="flex items-center justify-between">
        <p className={cn('text-lg font-extrabold tabular-nums', style.text)}>{item.numero}</p>
        <span className={cn('text-[9px] font-bold uppercase tracking-wider', style.text)}>{style.label}</span>
      </div>
      <p className="text-[10px] text-muted-foreground truncate">{item.type}</p>
      {item.current_booking ? (
        <div className="mt-1.5">
          <p className="text-[10px] truncate">{item.current_booking.customer_nombre}</p>
          {haUntil && <p className="text-[10px] text-muted-foreground">Hasta {haUntil}</p>}
          {item.current_booking.importe_pendiente > 0 && (
            <p className="text-[9px] font-bold text-amber-700 dark:text-amber-300 mt-0.5">
              Saldo {formatCurrency(item.current_booking.importe_pendiente, item.current_booking.moneda)}
            </p>
          )}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground mt-1.5">Libre</p>
      )}
    </Link>
  );
}

function PendingPaymentCard({ item, onChanged }: { item: PendingPaymentItem; onChanged: () => Promise<void> }) {
  const dialog = useDialog();
  async function handleConfirm() {
    try {
      await confirmPayment(item.payment_id);
      toast.success('Pago confirmado');
      await onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }
  async function handleReject() {
    const reason = await dialog.prompt({
      title: 'Rechazar pago',
      message: 'Indica el motivo del rechazo. Quedara registrado en el audit log.',
      placeholder: 'Ej: referencia no encontrada en el extracto',
      required: true,
      multiline: true,
      maxLength: 500,
    });
    if (!reason) return;
    try {
      await rejectPayment(item.payment_id, reason);
      toast.success('Pago rechazado');
      await onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }
  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold tabular-nums">{formatCurrency(item.monto, item.moneda)}</p>
        <span className="text-[10px] text-muted-foreground uppercase">{METHOD_LABELS[item.method as PaymentMethod] ?? item.method}</span>
      </div>
      {item.booking_codigo && <p className="text-[11px] text-muted-foreground">{item.booking_codigo}</p>}
      {item.customer_nombre && <p className="text-[10px] truncate">{item.customer_nombre}</p>}
      {item.referencia && <p className="text-[10px] text-muted-foreground">ref {item.referencia}</p>}
      <div className="flex gap-1.5 mt-2">
        <button type="button" onClick={handleConfirm} className="flex-1 text-[10px] font-bold uppercase bg-emerald-600 text-white rounded px-2 py-1 hover:bg-emerald-700">Confirmar</button>
        <button type="button" onClick={handleReject} className="flex-1 text-[10px] font-bold uppercase bg-card border border-border rounded px-2 py-1 hover:bg-muted">Rechazar</button>
      </div>
    </div>
  );
}

function NoPaymentCard({ item }: { item: BookingWithoutPaymentItem }) {
  return (
    <Link to={`/bookings/${item.booking_id}`} className="block rounded-lg border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 p-2.5 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold truncate">{item.codigo}</p>
        <span className="text-[10px] font-bold text-red-700 dark:text-red-300 tabular-nums whitespace-nowrap">
          en {item.hours_until_checkin.toFixed(1)}h
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground truncate">{item.customer_nombre} · Hab. {item.room_numero}</p>
      <p className="text-[10px] text-muted-foreground tabular-nums">{formatCurrency(item.importe_total, item.moneda)}</p>
    </Link>
  );
}
