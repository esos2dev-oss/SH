import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { X, UserPlus, MagnifyingGlass, Warning, CheckCircle, CurrencyCircleDollar } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import {
  listCustomers, createCustomer,
  REFERRAL_SOURCE_LABELS,
  type Customer, type DocKind, type ReferralSource,
} from '../../customers/api/customers.api';
import {
  availability, createBooking, confirmBooking,
  type BookingPeriod, type AvailabilityRoom,
} from '../api/bookings.api';
import { createPayment, type PaymentMethod } from '../../payments/api/payments.api';
import { formatCurrency } from '../../../shared/lib/format';

interface Props {
  onClose: () => void;
  onSaved: (bookingId: number) => void;
}

type CustomerMode = 'existing' | 'new';

const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'efectivo',     label: 'Efectivo' },
  { value: 'efectivo_usd', label: 'Efectivo USD' },
  { value: 'efectivo_bs',  label: 'Efectivo Bs' },
  { value: 'tarjeta',      label: 'Tarjeta' },
  { value: 'punto_venta',  label: 'Punto de venta' },
  { value: 'transferencia',label: 'Transferencia' },
  { value: 'pago_movil',   label: 'Pago movil' },
  { value: 'zelle',        label: 'Zelle' },
  { value: 'paypal',       label: 'PayPal' },
  { value: 'otro',         label: 'Otro' },
];

export function BookingFormDialog({ onClose, onSaved }: Props) {
  // === Estado: Cliente ===
  const [customerMode, setCustomerMode] = useState<CustomerMode>('existing');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  // Nuevo cliente (inline)
  const [newCustNombres, setNewCustNombres] = useState('');
  const [newCustApellidos, setNewCustApellidos] = useState('');
  const [newCustDocKind, setNewCustDocKind] = useState<DocKind>('cedula');
  const [newCustDocNumero, setNewCustDocNumero] = useState('');
  const [newCustTelefono, setNewCustTelefono] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustDireccion, setNewCustDireccion] = useState('');
  const [newCustReferral, setNewCustReferral] = useState<ReferralSource | ''>('');
  const [newCustReferralOther, setNewCustReferralOther] = useState('');

  // === Estado: Reserva ===
  const [period, setPeriod] = useState<BookingPeriod>('dia');
  const [fechaEntrada, setFechaEntrada] = useState('');
  const [fechaSalida, setFechaSalida] = useState('');
  const [huespedes, setHuespedes] = useState(1);
  const [available, setAvailable] = useState<AvailabilityRoom[]>([]);
  const [roomId, setRoomId] = useState<number | ''>('');
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');

  // Reset del "confirmar excede cap" cuando cambia la habitacion o huespedes
  useEffect(() => { setConfirmarExcedeCap(false); }, [roomId, huespedes]);

  // === Estado: Importe / descuento ===
  const [descuentoPct, setDescuentoPct] = useState(0);
  const [descuentoMonto, setDescuentoMonto] = useState(0);
  // Delta de desayunos respecto al numero de huespedes.
  // 0 = exactamente huespedes desayunos (incluidos). Negativo = menos. Positivo = mas.
  const [desayunosExtra, setDesayunosExtra] = useState(0);
  // Confirmacion explicita cuando la habitacion elegida tiene menos capacidad que huespedes.
  const [confirmarExcedeCap, setConfirmarExcedeCap] = useState(false);

  // === Estado: Pago inicial (OBLIGATORIO — min 50% o 100%) ===
  // Politica: no se puede crear una reserva sin adelanto minimo del 50%.
  const [payPreset, setPayPreset] = useState<'50' | '100'>('50');
  const [payMonto, setPayMonto] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('efectivo');
  const [payReferencia, setPayReferencia] = useState('');
  const [payNotas, setPayNotas] = useState('');
  // (Politica: todos los pagos se registran como confirmados.)

  const [notas, setNotas] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [overlapError, setOverlapError] = useState<string | null>(null);

  // Cargar clientes al inicio (para empezar con algo)
  useEffect(() => {
    void listCustomers({ limit: 20 }).then((r) => setCustomerResults(r.data));
  }, []);

  // Buscar clientes con debounce + cancel flag (evita race si responde tarde)
  useEffect(() => {
    if (customerMode !== 'existing') return;
    let cancelled = false;
    const t = setTimeout(() => {
      void listCustomers({ search: customerSearch || undefined, limit: 20 })
        .then((r) => { if (!cancelled) setCustomerResults(r.data); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [customerSearch, customerMode]);

  // Buscar disponibilidad al cambiar fechas/huespedes.
  // El flag `cancelled` evita que una respuesta vieja sobreescriba una nueva
  // si el usuario tipea rapido (race condition mostrando habitaciones que
  // ya no estan disponibles).
  useEffect(() => {
    if (!fechaEntrada || !fechaSalida) { setAvailable([]); setRoomId(''); return; }
    let cancelled = false;
    setRoomLoading(true);
    const entradaIso = new Date(fechaEntrada + 'T14:00:00').toISOString();
    const salidaIso = new Date(fechaSalida + 'T11:00:00').toISOString();
    void availability({ dateFrom: entradaIso, dateTo: salidaIso, huespedes })
      .then((rs) => { if (!cancelled) setAvailable(rs); })
      .catch(() => { if (!cancelled) setAvailable([]); })
      .finally(() => { if (!cancelled) setRoomLoading(false); });
    return () => { cancelled = true; };
  }, [fechaEntrada, fechaSalida, huespedes]);

  // === Calculo en vivo del total ===
  // Debe replicar la logica del edge function booking-create: la tarifa
  // proviene del room_type segun el periodo (dia/semana/mes), y las unidades
  // se calculan dividiendo los dias por el factor del periodo.
  const calc = useMemo(() => {
    const room = available.find((r) => r.id === roomId);
    if (!room || !fechaEntrada || !fechaSalida) return null;
    const e = new Date(fechaEntrada);
    const s = new Date(fechaSalida);
    const dias = Math.max(1, Math.ceil((s.getTime() - e.getTime()) / 86400000));
    let unidades = dias;
    let tarifa = room.tarifa_dia;
    if (period === 'semana') { unidades = Math.max(1, Math.ceil(dias / 7));  tarifa = room.tarifa_semana; }
    if (period === 'mes')    { unidades = Math.max(1, Math.ceil(dias / 30)); tarifa = room.tarifa_mes;    }
    const subtotal = tarifa * unidades;
    const descPctValor = (subtotal * Math.max(0, Math.min(100, descuentoPct))) / 100;
    // Ajuste por desayunos: $7 por desayuno extra por dia (o descuento si negativo)
    const BREAKFAST_PRICE = 7;
    const desayunosMonto = desayunosExtra * BREAKFAST_PRICE * dias;
    const total = Math.max(0, subtotal - descPctValor - Math.max(0, descuentoMonto) + desayunosMonto);
    const descuentoExcedido = descuentoMonto > subtotal;
    return { unidades, tarifa, subtotal, descPctValor, desayunosMonto, dias, total, descuentoExcedido };
  }, [available, roomId, fechaEntrada, fechaSalida, period, descuentoPct, descuentoMonto, desayunosExtra]);

  // Sincroniza monto con preset (50% o 100%) cada vez que cambia el total.
  useEffect(() => {
    if (!calc) return;
    const pct = payPreset === '100' ? 1 : 0.5;
    setPayMonto((calc.total * pct).toFixed(2));
  }, [calc?.total, payPreset]);

  const payMontoNum = Number(payMonto || 0);
  const minPago = calc ? calc.total * 0.5 : 0;
  const payExcedeTotal = calc !== null && payMontoNum > calc.total + 0.01;
  const payInsuficiente = calc !== null && payMontoNum < minPago - 0.01;

  const canSubmit = useMemo(() => {
    if (customerMode === 'existing' && !selectedCustomer) return false;
    if (customerMode === 'new') {
      if (!newCustNombres.trim() || !newCustApellidos.trim() || !newCustDocNumero.trim()) return false;
      if (newCustReferral === 'otro' && !newCustReferralOther.trim()) return false;
    }
    if (!fechaEntrada || !fechaSalida || !roomId) return false;
    const selRoom = available.find((r) => r.id === roomId);
    if (selRoom && huespedes > selRoom.capacidad && !confirmarExcedeCap) return false;
    // Pago obligatorio: minimo 50%
    if (!calc || calc.total <= 0) return false;
    if (payMontoNum < minPago - 0.01) return false;
    if (payMontoNum > calc.total + 0.01) return false;
    return true;
  }, [customerMode, selectedCustomer, newCustNombres, newCustApellidos, newCustDocNumero, newCustReferral, newCustReferralOther, fechaEntrada, fechaSalida, roomId, available, huespedes, confirmarExcedeCap, payMontoNum, calc, minPago]);

  function describeMissing(): string | null {
    const missing: string[] = [];
    if (customerMode === 'existing') {
      if (!selectedCustomer) missing.push('Huesped');
    } else {
      if (!newCustNombres.trim())  missing.push('Nombres');
      if (!newCustApellidos.trim()) missing.push('Apellidos');
      if (!newCustDocNumero.trim()) missing.push('Documento');
      if (newCustReferral === 'otro' && !newCustReferralOther.trim()) missing.push('Detalle "otro"');
    }
    if (!fechaEntrada) missing.push('Fecha de entrada');
    if (!fechaSalida)  missing.push('Fecha de salida');
    if (!roomId)       missing.push('Habitacion');
    // Si la habitacion elegida tiene menos capacidad que los huespedes, exigimos check.
    const selRoom = available.find((r) => r.id === roomId);
    if (selRoom && huespedes > selRoom.capacidad && !confirmarExcedeCap) {
      return `Marca "Confirmo" para reservar ${huespedes} huespedes en la habitacion ${selRoom.numero} (capacidad ${selRoom.capacidad}).`;
    }
    if (!calc || calc.total <= 0) missing.push('Seleccionar habitacion');
    else if (payInsuficiente) return `Pago insuficiente. Minimo 50% (${formatCurrency(minPago)}). Elige "50% adelanto" o "100% completo".`;
    else if (payExcedeTotal) return `El monto (${formatCurrency(payMontoNum)}) supera el total de la reserva (${formatCurrency(calc.total)}).`;
    if (missing.length === 0) return null;
    if (missing.length === 1) return `Falta: ${missing[0]}`;
    if (missing.length === 2) return `Faltan: ${missing[0]} y ${missing[1]}`;
    return `Faltan: ${missing.slice(0, -1).join(', ')} y ${missing[missing.length - 1]}`;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const missing = describeMissing();
    if (missing) {
      toast.error(missing);
      return;
    }
    setSubmitting(true);
    setOverlapError(null);
    try {
      // 1. Resolver customer_id (existente o crear inline)
      let customerId: number;
      if (customerMode === 'new') {
        const created = await createCustomer({
          nombres: newCustNombres.trim(),
          apellidos: newCustApellidos.trim(),
          doc_kind: newCustDocKind,
          doc_numero: newCustDocNumero.trim(),
          email: newCustEmail.trim() || null,
          telefono: newCustTelefono.trim() || null,
          direccion: newCustDireccion.trim() || null,
          referral_source: newCustReferral || null,
          referral_other: newCustReferral === 'otro' ? newCustReferralOther.trim() : null,
        });
        customerId = created.id;
        toast.success(`Huesped ${created.nombres} ${created.apellidos} creado`);
      } else {
        customerId = selectedCustomer!.id;
      }

      // 2. Crear booking
      const entradaIso = new Date(fechaEntrada + 'T14:00:00').toISOString();
      const salidaIso = new Date(fechaSalida + 'T11:00:00').toISOString();
      const booking = await createBooking({
        customer_id: customerId,
        room_id: Number(roomId),
        period,
        fecha_entrada: entradaIso,
        fecha_salida: salidaIso,
        huespedes,
        descuento_pct: descuentoPct || undefined,
        descuento_monto: descuentoMonto || undefined,
        desayunos_extra: desayunosExtra,
        notas: notas.trim() || null,
      });

      // 3. Crear pago inicial (OBLIGATORIO).
      let pagoExito = true;
      let pagoErrorMsg = '';
      let pagoConfirmado = false;
      try {
        const created = await createPayment({
          booking_id: booking.id,
          customer_id: customerId,
          monto: Number(payMonto),
          moneda: booking.moneda,
          method: payMethod,
          referencia: payReferencia.trim() || null,
          notas: payNotas.trim() || null,
          pagado_at: new Date().toISOString(),
          force_status: 'confirmed',
        });
        pagoConfirmado = created.status === 'confirmed';
      } catch (payErr) {
        pagoExito = false;
        pagoErrorMsg = payErr instanceof Error ? payErr.message : 'Error';
      }

      // 4. Si el pago quedo confirmado y cubre al menos 50%, avanzar reserva a "confirmada"
      if (pagoExito && pagoConfirmado && Number(payMonto) >= calc!.total * 0.5 - 0.01) {
        try { await confirmBooking(booking.id); } catch { /* no critico */ }
      }

      if (pagoExito) {
        const label = payPreset === '100' ? '100%' : '50%';
        const stateMsg = pagoConfirmado ? '· pago confirmado · reserva confirmada' : '· pago pendiente de conciliar';
        toast.success(`Reserva ${booking.codigo} creada (${label}) ${stateMsg}`);
      } else {
        toast.warning(`Reserva ${booking.codigo} creada pero el pago fallo (${pagoErrorMsg}). Reintenta desde el detalle.`);
      }
      onSaved(booking.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT') {
        setOverlapError(err.message);
        toast.error('Solapamiento detectado');
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Error');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-3xl w-full max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Nueva reserva</h2>
            <p className="text-xs text-muted-foreground">Cliente, fechas, habitacion y pago en un mismo paso</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-6">

          {/* === 1. CLIENTE === */}
          <Section title="1 · Huesped" subtitle="Selecciona uno existente o crea uno nuevo">
            <div className="flex gap-2 mb-3">
              <TabButton active={customerMode === 'existing'} onClick={() => setCustomerMode('existing')}>
                <MagnifyingGlass size={14} weight="bold" /> Buscar existente
              </TabButton>
              <TabButton active={customerMode === 'new'} onClick={() => setCustomerMode('new')}>
                <UserPlus size={14} weight="bold" /> Crear nuevo
              </TabButton>
            </div>

            {customerMode === 'existing' ? (
              <div className="space-y-2">
                <div className="relative">
                  <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Buscar por nombre, apellido o documento..."
                    className="w-full h-11 pl-9 pr-3 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:bg-card"
                  />
                </div>
                {selectedCustomer ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-primary bg-primary/5">
                    <CheckCircle weight="fill" className="text-primary" size={20} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{selectedCustomer.nombres} {selectedCustomer.apellidos}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {selectedCustomer.doc_kind} {selectedCustomer.doc_numero}
                        {selectedCustomer.telefono && ` · ${selectedCustomer.telefono}`}
                      </p>
                    </div>
                    <button type="button" onClick={() => setSelectedCustomer(null)} className="text-xs text-muted-foreground hover:text-foreground">Cambiar</button>
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-border divide-y">
                    {customerResults.length === 0 ? (
                      <div className="p-3 text-center space-y-1">
                        <p className="text-xs text-muted-foreground">Sin resultados para "{customerSearch || '...'}"</p>
                        <button type="button" onClick={() => setCustomerMode('new')} className="text-xs font-semibold text-primary hover:underline">
                          Crear nuevo huesped
                        </button>
                      </div>
                    ) : customerResults.map((c) => (
                      <button key={c.id} type="button" onClick={() => setSelectedCustomer(c)} className="w-full text-left p-2.5 hover:bg-muted/50 text-sm">
                        <p className="font-semibold">{c.nombres} {c.apellidos}</p>
                        <p className="text-[11px] text-muted-foreground">{c.doc_kind} {c.doc_numero}{c.telefono ? ` · ${c.telefono}` : ''}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nombres" required value={newCustNombres} onChange={setNewCustNombres} />
                  <Field label="Apellidos" required value={newCustApellidos} onChange={setNewCustApellidos} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Tipo doc</Label>
                    <select value={newCustDocKind} onChange={(e) => setNewCustDocKind(e.target.value as DocKind)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm">
                      <option value="cedula">Cedula</option>
                      <option value="dni">DNI</option>
                      <option value="pasaporte">Pasaporte</option>
                      <option value="licencia">Licencia</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div className="col-span-2"><Field label="Numero" required value={newCustDocNumero} onChange={setNewCustDocNumero} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Telefono" value={newCustTelefono} onChange={setNewCustTelefono} />
                  <Field label="Email" type="email" value={newCustEmail} onChange={setNewCustEmail} />
                </div>
                <Field label="Direccion" value={newCustDireccion} onChange={setNewCustDireccion} />
                <div>
                  <Label>Como nos conocio</Label>
                  <select value={newCustReferral} onChange={(e) => setNewCustReferral(e.target.value as ReferralSource | '')} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm">
                    <option value="">— Sin especificar —</option>
                    {Object.entries(REFERRAL_SOURCE_LABELS).map(([v, label]) => (
                        <option key={v} value={v}>{label}</option>
                      ))}
                  </select>
                </div>
                {newCustReferral === 'otro' && (
                  <Field label="Especifica" required value={newCustReferralOther} onChange={setNewCustReferralOther} />
                )}
              </div>
            )}
          </Section>

          {/* === 2. RESERVA === */}
          <Section title="2 · Fechas y habitacion" subtitle="El sistema valida automaticamente solapamientos">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Periodo</Label>
                <select value={period} onChange={(e) => setPeriod(e.target.value as BookingPeriod)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm">
                  <option value="dia">Por dia</option>
                  <option value="semana">Por semana</option>
                  <option value="mes">Por mes</option>
                </select>
              </div>
              <div>
                <Label>Entrada</Label>
                <input type="date" value={fechaEntrada} onChange={(e) => setFechaEntrada(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm" required />
              </div>
              <div>
                <Label>Salida</Label>
                <input type="date" value={fechaSalida} onChange={(e) => setFechaSalida(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm" required />
              </div>
            </div>
            <div className="mt-3">
              <Label>Huespedes</Label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setHuespedes((h) => Math.max(1, h - 1))} className="h-11 w-11 rounded-xl border border-border bg-card font-bold text-lg hover:bg-muted active:scale-95 transition-transform">−</button>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={huespedes}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, '');
                    if (v === '') { setHuespedes(1); return; }
                    setHuespedes(Math.max(1, Number(v)));
                  }}
                  className="flex-1 h-11 px-4 rounded-xl border border-border bg-muted/50 text-center font-bold text-lg tabular-nums"
                />
                <button type="button" onClick={() => setHuespedes((h) => h + 1)} className="h-11 w-11 rounded-xl border border-border bg-card font-bold text-lg hover:bg-muted active:scale-95 transition-transform">+</button>
              </div>
            </div>
            {huespedes > 1 && (
              <p className="text-[11px] text-muted-foreground mt-2 pl-1">
                Los datos de los {huespedes - 1} acompañante{huespedes - 1 > 1 ? 's' : ''} se capturan en el check-in.
              </p>
            )}

            {fechaEntrada && fechaSalida && (
              <div className="mt-4">
                <div className="flex items-end justify-between gap-2 mb-1.5">
                  <Label>Habitacion disponible <span className="text-muted-foreground font-normal normal-case">({available.length})</span></Label>
                  {available.length > 6 && (
                    <input
                      value={roomSearch}
                      onChange={(e) => setRoomSearch(e.target.value)}
                      placeholder="Buscar por numero..."
                      className="h-8 px-3 rounded-lg border border-border bg-muted/50 text-xs w-40 outline-none focus:border-primary"
                    />
                  )}
                </div>
                {roomLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto p-0.5">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
                  </div>
                ) : available.length === 0 ? (
                  <div className="flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 rounded-xl p-3 border border-amber-200 dark:border-amber-900">
                    <Warning size={16} weight="duotone" className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Sin habitaciones disponibles</p>
                      <p>Todas las habitaciones para esas fechas estan ocupadas o no caben los huespedes. Cambia las fechas o reduce los huespedes.</p>
                    </div>
                  </div>
                ) : (
                  <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto p-0.5">
                    {available
                      .filter((r) => !roomSearch || r.numero.toLowerCase().includes(roomSearch.toLowerCase()))
                      .map((r) => {
                        const tarifa = period === 'dia' ? r.tarifa_dia : period === 'semana' ? r.tarifa_semana : r.tarifa_mes;
                        const excedeCap = huespedes > r.capacidad;
                        const selected = roomId === r.id;
                        return (
                          <button key={r.id} type="button" onClick={() => setRoomId(r.id)}
                            className={`text-left p-3 rounded-xl border transition-all ${
                              selected ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                              : excedeCap ? 'border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                              : 'border-border bg-card hover:bg-muted/30'
                            }`}>
                            <p className="font-bold">Hab. {r.numero}</p>
                            <p className="text-[11px] text-muted-foreground">{r.room_type}</p>
                            <p className="text-[10px] text-muted-foreground">Capacidad: {r.capacidad} pax</p>
                            <p className="text-xs font-semibold mt-1">{formatCurrency(tarifa)} / {period}</p>
                            {excedeCap && (
                              <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 mt-1">
                                ⚠ Excede capacidad ({huespedes} &gt; {r.capacidad})
                              </p>
                            )}
                          </button>
                        );
                      })}
                  </div>
                  {(() => {
                    const selRoom = available.find((r) => r.id === roomId);
                    if (!selRoom || huespedes <= selRoom.capacidad) return null;
                    return (
                      <label className="flex items-start gap-2 mt-3 p-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={confirmarExcedeCap}
                          onChange={(e) => setConfirmarExcedeCap(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded"
                        />
                        <span className="text-xs text-amber-900 dark:text-amber-100">
                          <strong>Confirmo</strong> que caben <strong>{huespedes} huespedes</strong> en la habitacion <strong>{selRoom.numero}</strong> ({selRoom.room_type}, capacidad {selRoom.capacidad}). Puede requerir camas extra o incomodidad.
                        </span>
                      </label>
                    );
                  })()}
                  </>
                )}
              </div>
            )}
          </Section>

          {/* === 3. IMPORTE === */}
          {calc && (
            <Section title="3 · Importe" subtitle="Calcula en vivo segun tarifa y descuentos">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <Label>Descuento (%)</Label>
                  <input type="number" min={0} max={100} step="0.01" value={descuentoPct || ''} onChange={(e) => setDescuentoPct(Number(e.target.value) || 0)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm" placeholder="0" />
                </div>
                <div>
                  <Label>Descuento (monto fijo)</Label>
                  <input type="number" min={0} step="0.01" value={descuentoMonto || ''} onChange={(e) => setDescuentoMonto(Number(e.target.value) || 0)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm" placeholder="0" />
                </div>
              </div>
              {/* Desayunos */}
              <div className="rounded-xl border border-border bg-amber-50/60 dark:bg-amber-950/20 p-3 mb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Desayunos</p>
                    <p className="text-[11px] text-muted-foreground">
                      Incluidos: {huespedes} (1 por huesped). +/- $7/dia por desayuno adicional o menos.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setDesayunosExtra((v) => Math.max(-huespedes, v - 1))} className="h-9 w-9 rounded-lg border border-border bg-card font-bold text-lg hover:bg-muted disabled:opacity-40" disabled={huespedes + desayunosExtra <= 0}>−</button>
                    <div className="min-w-[3rem] text-center">
                      <p className="text-xl font-bold tabular-nums leading-none">{huespedes + desayunosExtra}</p>
                      <p className="text-[9px] text-muted-foreground uppercase">total</p>
                    </div>
                    <button type="button" onClick={() => setDesayunosExtra((v) => v + 1)} className="h-9 w-9 rounded-lg border border-border bg-card font-bold text-lg hover:bg-muted">+</button>
                  </div>
                </div>
                {desayunosExtra !== 0 && (
                  <p className={`mt-2 text-[11px] font-semibold ${desayunosExtra > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    {desayunosExtra > 0 ? '+' : ''}{desayunosExtra} desayuno{Math.abs(desayunosExtra) !== 1 ? 's' : ''} × $7 × {calc.dias} dia{calc.dias > 1 ? 's' : ''} = {desayunosExtra > 0 ? '+' : ''}{formatCurrency(calc.desayunosMonto)}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{formatCurrency(calc.tarifa)} × {calc.unidades} {period}{calc.unidades > 1 ? 's' : ''}</span><span className="tabular-nums">{formatCurrency(calc.subtotal)}</span></div>
                {calc.descPctValor > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Descuento {descuentoPct}%</span><span className="tabular-nums">−{formatCurrency(calc.descPctValor)}</span></div>}
                {descuentoMonto > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Descuento fijo</span><span className="tabular-nums">−{formatCurrency(descuentoMonto)}</span></div>}
                {calc.desayunosMonto !== 0 && (
                  <div className={`flex justify-between ${calc.desayunosMonto > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    <span>Desayunos ({desayunosExtra > 0 ? '+' : ''}{desayunosExtra})</span>
                    <span className="tabular-nums">{calc.desayunosMonto > 0 ? '+' : '−'}{formatCurrency(Math.abs(calc.desayunosMonto))}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-1.5 mt-1.5 font-bold"><span>Total</span><span className="tabular-nums text-base">{formatCurrency(calc.total)}</span></div>
              </div>
              {calc.descuentoExcedido && (
                <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <Warning size={12} weight="duotone" /> El descuento fijo supera el subtotal. El total se ajusto a 0.
                </p>
              )}
            </Section>
          )}

          {/* === 4. PAGO INICIAL (OBLIGATORIO) === */}
          <Section title="4 · Pago inicial (obligatorio)" subtitle="Politica del hotel: minimo 50% al reservar o 100% completo. No se aceptan reservas sin adelanto.">
            {!calc ? (
              <p className="text-xs text-muted-foreground bg-muted/30 rounded-xl p-3">Primero selecciona fechas y habitacion.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-primary font-semibold">
                  <CurrencyCircleDollar size={16} weight="duotone" />
                  Elige el adelanto
                </div>
                {/* Botones rapidos + slider libre 50-100% */}
                <div className="grid grid-cols-3 gap-2">
                  {[50, 75, 100].map((pct) => {
                    const monto = calc.total * (pct / 100);
                    const isActive = Math.abs(payMontoNum - monto) < 0.01;
                    return (
                      <button key={pct} type="button" onClick={() => { setPayPreset(pct === 50 ? '50' : '100'); setPayMonto(monto.toFixed(2)); }}
                        className={`p-2 rounded-xl border-2 transition-all ${isActive ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/30'}`}>
                        <p className="font-bold text-xs">{pct}%</p>
                        <p className="text-sm font-extrabold tabular-nums text-primary">{formatCurrency(monto)}</p>
                      </button>
                    );
                  })}
                </div>
                <div>
                  <Label>Ajusta el monto (minimo {formatCurrency(minPago)} · maximo {formatCurrency(calc.total)})</Label>
                  <input
                    type="range" min={minPago} max={calc.total} step="0.01" value={payMontoNum || minPago}
                    onChange={(e) => setPayMonto(Number(e.target.value).toFixed(2))}
                    className="w-full accent-primary h-2"
                  />
                  <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                    <span>50%</span>
                    <span className="font-bold text-primary text-sm tabular-nums">{formatCurrency(payMontoNum || 0)} ({calc.total > 0 ? Math.round((payMontoNum / calc.total) * 100) : 0}%)</span>
                    <span>100%</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Metodo <span className="text-red-500">*</span></Label>
                    <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm">
                      {PAYMENT_METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Monto (editable)</Label>
                    <input type="number" min={minPago} max={calc.total} step="0.01" value={payMonto} onChange={(e) => setPayMonto(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm tabular-nums font-mono" />
                  </div>
                </div>

                {payInsuficiente && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1.5 bg-red-50 dark:bg-red-950/30 rounded-lg p-2 border border-red-200 dark:border-red-800">
                    <Warning size={12} weight="duotone" /> Pago insuficiente. Minimo 50% ({formatCurrency(minPago)}).
                  </p>
                )}
                {payExcedeTotal && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <Warning size={12} weight="duotone" /> El monto supera el total ({formatCurrency(calc.total)}).
                  </p>
                )}

                <Field label="Referencia (n° operacion, ultimos digitos, etc.)" value={payReferencia} onChange={setPayReferencia} />
                <div>
                  <Label>Notas del pago</Label>
                  <textarea value={payNotas} onChange={(e) => setPayNotas(e.target.value)} rows={2} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm" placeholder="Detalle del pago, banco, etc." />
                </div>

                <p className="text-[11px] text-muted-foreground">Adjunta el comprobante (foto/PDF) desde el detalle de la reserva luego de crearla.</p>
              </div>
            )}
          </Section>

          {/* === Notas generales === */}
          <Section title="5 · Notas internas" subtitle="Visible para el personal">
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm" placeholder="Llega tarde, alergico al gluten..." />
          </Section>

          {/* === Error de solapamiento === */}
          {overlapError && (
            <div className="flex items-start gap-2 text-sm bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 rounded-xl p-3 border border-red-200 dark:border-red-900">
              <Warning size={18} weight="duotone" className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Reserva duplicada detectada</p>
                <p>{overlapError} Cambia las fechas o elige otra habitacion.</p>
              </div>
            </div>
          )}

          <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-card border-t border-border flex gap-2">
            <button type="submit" disabled={!canSubmit || submitting} className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-50">
              {submitting ? 'Creando...' : 'Crear reserva'}
            </button>
            <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
          </div>

        </form>
      </div>
    </div>
  );
}

// === Helpers de UI ===

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3">
        <h3 className="text-sm font-bold">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 h-10 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}
    >
      {children}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">{children}</label>;
}

function Field({ label, value, onChange, type = 'text', required, placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <div>
      <Label>{label} {required && <span className="text-destructive">*</span>}</Label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" />
    </div>
  );
}
