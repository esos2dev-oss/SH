import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { X, Tag } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { listCustomers, type Customer } from '../../customers/api/customers.api';
import { availability, createBooking, type BookingPeriod, type AvailabilityRoom } from '../api/bookings.api';
import { validatePromotion } from '../../promotions/api/promotions.api';
import { formatCurrency } from '../../../shared/lib/format';

interface Props {
  onClose: () => void;
  onSaved: (bookingId: number) => void;
}

export function BookingFormDialog({ onClose, onSaved }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [period, setPeriod] = useState<BookingPeriod>('dia');
  const [fechaEntrada, setFechaEntrada] = useState('');
  const [fechaSalida, setFechaSalida] = useState('');
  const [huespedes, setHuespedes] = useState(1);
  const [available, setAvailable] = useState<AvailabilityRoom[]>([]);
  const [roomId, setRoomId] = useState<number | ''>('');
  const [promoCode, setPromoCode] = useState('');
  const [promoFeedback, setPromoFeedback] = useState<{ valid: boolean; reason?: string } | null>(null);
  const [notas, setNotas] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void listCustomers({ limit: 100 }).then((r) => setCustomers(r.data));
  }, []);

  // Buscar disponibilidad al cambiar fechas
  useEffect(() => {
    if (!fechaEntrada || !fechaSalida) { setAvailable([]); setRoomId(''); return; }
    const entradaIso = new Date(fechaEntrada + 'T14:00:00').toISOString();
    const salidaIso = new Date(fechaSalida + 'T11:00:00').toISOString();
    void availability({ dateFrom: entradaIso, dateTo: salidaIso, huespedes })
      .then((rs) => setAvailable(rs))
      .catch(() => setAvailable([]));
  }, [fechaEntrada, fechaSalida, huespedes]);

  async function checkPromo() {
    if (!promoCode.trim() || !fechaEntrada || !fechaSalida) return;
    try {
      const res = await validatePromotion({ codigo: promoCode.trim(), fecha_entrada: fechaEntrada, fecha_salida: fechaSalida });
      setPromoFeedback({ valid: res.valid, ...(res.reason !== undefined ? { reason: res.reason } : {}) });
    } catch {
      setPromoFeedback({ valid: false, reason: 'Error validando' });
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customerId || !roomId || !fechaEntrada || !fechaSalida) {
      toast.error('Completa todos los campos requeridos');
      return;
    }
    setSubmitting(true);
    try {
      const entradaIso = new Date(fechaEntrada + 'T14:00:00').toISOString();
      const salidaIso = new Date(fechaSalida + 'T11:00:00').toISOString();
      const created = await createBooking({
        customer_id: Number(customerId),
        room_id: Number(roomId),
        period,
        fecha_entrada: entradaIso,
        fecha_salida: salidaIso,
        huespedes,
        promotion_code: promoCode.trim() || null,
        notas: notas.trim() || null,
      });
      toast.success(`Reserva ${created.codigo} creada`);
      onSaved(created.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Nueva reserva</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Cliente */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Huesped</label>
            <select value={customerId} onChange={(e) => setCustomerId(Number(e.target.value))} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer outline-none focus:border-primary focus:bg-card" required>
              <option value="">— Seleccionar —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.nombres} {c.apellidos} ({c.doc_kind} {c.doc_numero})</option>)}
            </select>
          </div>

          {/* Periodo + Fechas */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Periodo</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value as BookingPeriod)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer outline-none focus:border-primary focus:bg-card">
                <option value="dia">Por dia</option>
                <option value="semana">Por semana</option>
                <option value="mes">Por mes</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Entrada</label>
              <input type="date" value={fechaEntrada} onChange={(e) => setFechaEntrada(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" required />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Salida</label>
              <input type="date" value={fechaSalida} onChange={(e) => setFechaSalida(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" required />
            </div>
          </div>

          {/* Huespedes */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Huespedes</label>
            <input type="number" min={1} value={huespedes} onChange={(e) => setHuespedes(Math.max(1, Number(e.target.value)))} className="w-32 h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" />
          </div>

          {/* Habitaciones disponibles */}
          {fechaEntrada && fechaSalida && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Habitacion disponible</label>
              {available.length === 0 ? (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-xl p-3">Sin habitaciones disponibles para esas fechas.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {available.map((r) => (
                    <button key={r.id} type="button" onClick={() => setRoomId(r.id)} className={`text-left p-3 rounded-xl border transition-all ${roomId === r.id ? 'border-primary bg-primary/5 ring-2 ring-primary/30' : 'border-border bg-card hover:bg-muted/30'}`}>
                      <p className="font-bold">Hab. {r.numero}</p>
                      <p className="text-[11px] text-muted-foreground">{r.room_type}{r.planta ? ` · planta ${r.planta}` : ''}</p>
                      <p className="text-xs font-semibold mt-1">{formatCurrency(r.tarifa_dia)} / dia</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Promo code */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Codigo de promocion (opcional)</label>
            <div className="flex gap-2">
              <input value={promoCode} onChange={(e) => { setPromoCode(e.target.value); setPromoFeedback(null); }} className="flex-1 h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" placeholder="VERANO20" />
              <button type="button" onClick={checkPromo} disabled={!promoCode.trim() || !fechaEntrada || !fechaSalida} className="h-11 px-4 text-sm font-semibold border border-border bg-card rounded-xl hover:bg-muted disabled:opacity-50">Validar</button>
            </div>
            {promoFeedback && (
              <p className={`mt-1 text-xs ${promoFeedback.valid ? 'text-emerald-600' : 'text-destructive'}`}>
                <Tag size={12} className="inline mr-1" />
                {promoFeedback.valid ? 'Codigo valido — se aplicara al crear' : (promoFeedback.reason ?? 'Codigo invalido')}
              </p>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Notas</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" placeholder="Llega tarde, alergico al gluten..." />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting || !customerId || !roomId} className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-50">{submitting ? 'Creando...' : 'Crear reserva'}</button>
            <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
