import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { X, UserPlus, MagnifyingGlass, Warning, CheckCircle, CurrencyCircleDollar } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { errorMessage } from '../../../shared/lib/errors';
import {
  listCustomers, createCustomer,
  REFERRAL_SOURCE_LABELS,
  type Customer, type DocKind, type ReferralSource,
} from '../../customers/api/customers.api';
import {
  availability, createBooking,
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
  const [customerTotal, setCustomerTotal] = useState(0);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  // Nuevo cliente (inline)
  const [newCustNombres, setNewCustNombres] = useState('');
  const [newCustApellidos, setNewCustApellidos] = useState('');
  const [newCustDocKind, setNewCustDocKind] = useState<DocKind>('cedula');
  const [newCustDocNumero, setNewCustDocNumero] = useState('');
  const [newCustTelefono, setNewCustTelefono] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustDireccion, setNewCustDireccion] = useState('');
  const [newCustPlaca, setNewCustPlaca] = useState('');
  const [newCustReferral, setNewCustReferral] = useState<ReferralSource | ''>('');
  const [newCustReferralOther, setNewCustReferralOther] = useState('');

  // === Estado: Reserva ===
  const [period, setPeriod] = useState<BookingPeriod>('dia');
  const [fechaEntrada, setFechaEntrada] = useState('');
  const [fechaSalida, setFechaSalida] = useState('');
  const [huespedes, setHuespedes] = useState(1);
  const [bookingPlaca, setBookingPlaca] = useState('');
  const [available, setAvailable] = useState<AvailabilityRoom[]>([]);
  const [roomId, setRoomId] = useState<number | ''>('');
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');

  // === Estado: Importe / descuento ===
  const [descuentoPct, setDescuentoPct] = useState(0);
  const [descuentoMonto, setDescuentoMonto] = useState(0);

  // === Estado: Pago inicial (opcional) ===
  const [includePayment, setIncludePayment] = useState(false);
  const [payMonto, setPayMonto] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('efectivo');
  const [payReferencia, setPayReferencia] = useState('');
  const [payNotas, setPayNotas] = useState('');

  const [notas, setNotas] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [overlapError, setOverlapError] = useState<string | null>(null);

  // NOTA: aqui habia un segundo useEffect que cargaba los 20 primeros clientes
  // al montar, SIN flag de cancelacion. Competia con la busqueda de abajo: si
  // respondia despues, pisaba los resultados filtrados con la lista completa y
  // parecia que el buscador "ignoraba lo escrito". El efecto de abajo ya cubre
  // la carga inicial (se dispara con search vacio), asi que sobra.

  // Buscar clientes con debounce + cancel flag (evita race si responde tarde)
  useEffect(() => {
    if (customerMode !== 'existing') return;
    let cancelled = false;
    setCustomerLoading(true);
    const t = setTimeout(() => {
      listCustomers({ search: customerSearch || undefined, limit: 50 })
        .then((r) => { if (!cancelled) { setCustomerResults(r.data); setCustomerTotal(r.pagination.total); } })
        // Sin este catch el error se tragaba en silencio y la lista se quedaba
        // congelada con el resultado anterior.
        .catch((err) => {
          if (cancelled) return;
          setCustomerResults([]);
          toast.error(errorMessage(err, 'No se pudo buscar huespedes'));
        })
        .finally(() => { if (!cancelled) setCustomerLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [customerSearch, customerMode]);

  // Cuando se selecciona cliente existente, copiar su placa por defecto a la reserva
  useEffect(() => {
    if (selectedCustomer?.vehicle_plate && !bookingPlaca) {
      setBookingPlaca(selectedCustomer.vehicle_plate);
    }
  }, [selectedCustomer]);

  // === Validacion de fechas ===
  // Antes no habia ninguna: se podia poner salida 05/08 con entrada 10/08, el
  // formulario calculaba "1 dia = 56,00", ofrecia todas las habitaciones como
  // libres y solo fallaba en el servidor con un error tecnico en ingles (bug 9).
  const dateError = useMemo(() => {
    if (!fechaEntrada || !fechaSalida) return null;
    const e = new Date(`${fechaEntrada}T00:00:00`);
    const s = new Date(`${fechaSalida}T00:00:00`);
    if (Number.isNaN(e.getTime()) || Number.isNaN(s.getTime())) return 'Fechas invalidas.';
    if (s <= e) return 'La fecha de salida debe ser posterior a la de entrada.';
    return null;
  }, [fechaEntrada, fechaSalida]);

  // Buscar disponibilidad al cambiar fechas/huespedes.
  // El flag `cancelled` evita que una respuesta vieja sobreescriba una nueva
  // si el usuario tipea rapido (race condition mostrando habitaciones que
  // ya no estan disponibles).
  useEffect(() => {
    if (!fechaEntrada || !fechaSalida || dateError) { setAvailable([]); setRoomId(''); setRoomLoading(false); return; }
    let cancelled = false;
    setRoomLoading(true);
    const entradaIso = new Date(fechaEntrada + 'T14:00:00').toISOString();
    const salidaIso = new Date(fechaSalida + 'T11:00:00').toISOString();
    availability({ dateFrom: entradaIso, dateTo: salidaIso, huespedes })
      .then((rs) => { if (!cancelled) setAvailable(rs); })
      .catch((err) => {
        if (cancelled) return;
        setAvailable([]);
        toast.error(errorMessage(err, 'No se pudo consultar la disponibilidad'));
      })
      .finally(() => { if (!cancelled) setRoomLoading(false); });
    return () => { cancelled = true; };
  }, [fechaEntrada, fechaSalida, huespedes, dateError]);

  // === Calculo en vivo del total ===
  // Debe replicar la logica del edge function booking-create: la tarifa
  // proviene del room_type segun el periodo (dia/semana/mes), y las unidades
  // se calculan dividiendo los dias por el factor del periodo.
  const calc = useMemo(() => {
    const room = available.find((r) => r.id === roomId);
    if (!room || !fechaEntrada || !fechaSalida || dateError) return null;
    const e = new Date(`${fechaEntrada}T00:00:00`);
    const s = new Date(`${fechaSalida}T00:00:00`);
    const dias = Math.max(1, Math.round((s.getTime() - e.getTime()) / 86400000));
    let unidades = dias;
    let tarifa = room.tarifa_dia;
    if (period === 'semana') { unidades = Math.max(1, Math.ceil(dias / 7));  tarifa = room.tarifa_semana; }
    if (period === 'mes')    { unidades = Math.max(1, Math.ceil(dias / 30)); tarifa = room.tarifa_mes;    }
    const subtotal = tarifa * unidades;
    const descPctValor = (subtotal * Math.max(0, Math.min(100, descuentoPct))) / 100;
    const total = Math.max(0, subtotal - descPctValor - Math.max(0, descuentoMonto));
    const descuentoExcedido = descuentoMonto > subtotal;
    // La moneda sale del room_type, no de un default. Antes todo el bloque de
    // importes se pintaba en USD aunque la reserva se creara en EUR (bug 14).
    return { unidades, tarifa, subtotal, descPctValor, total, descuentoExcedido, moneda: room.moneda };
  }, [available, roomId, fechaEntrada, fechaSalida, period, descuentoPct, descuentoMonto, dateError]);

  const payMontoNum = Number(payMonto || 0);
  const payExcedeTotal = includePayment && calc !== null && payMontoNum > calc.total;

  // Lista de lo que falta, para poder DECIRLE al usuario por que no puede
  // enviar en vez de dejar el boton gris sin explicacion (bug 10).
  const missing = useMemo(() => {
    const out: string[] = [];
    if (customerMode === 'existing' && !selectedCustomer) out.push('selecciona un huesped');
    if (customerMode === 'new') {
      if (!newCustNombres.trim()) out.push('nombres del huesped');
      if (!newCustApellidos.trim()) out.push('apellidos del huesped');
      if (!newCustDocNumero.trim()) out.push('numero de documento');
      if (newCustReferral === 'otro' && !newCustReferralOther.trim()) out.push('detalle de "como nos conocio"');
    }
    if (!fechaEntrada) out.push('fecha de entrada');
    if (!fechaSalida) out.push('fecha de salida');
    if (dateError) out.push(dateError.toLowerCase().replace(/\.$/, ''));
    if (!roomId && !dateError) out.push('habitacion');
    if (includePayment) {
      if (!payMonto || Number(payMonto) <= 0) out.push('monto del pago');
      else if (calc && Number(payMonto) > calc.total) out.push('un monto de pago que no supere el total');
    }
    return out;
  }, [customerMode, selectedCustomer, newCustNombres, newCustApellidos, newCustDocNumero, newCustReferral, newCustReferralOther, fechaEntrada, fechaSalida, roomId, includePayment, payMonto, calc, dateError]);

  const canSubmit = missing.length === 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast.error(`Falta: ${missing.join(', ')}`);
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
          vehicle_plate: newCustPlaca.trim().toUpperCase() || null,
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
        vehicle_plate: bookingPlaca.trim().toUpperCase() || null,
        notas: notas.trim() || null,
      });

      // 3. Crear pago inicial si aplica.
      // Si el pago falla, la reserva ya esta creada — informamos UN solo mensaje
      // claro y llevamos al detalle para que el usuario reintente el cobro.
      let pagoExito = true;
      let pagoErrorMsg = '';
      if (includePayment && Number(payMonto) > 0) {
        try {
          await createPayment({
            booking_id: booking.id,
            customer_id: customerId,
            monto: Number(payMonto),
            moneda: booking.moneda,
            method: payMethod,
            referencia: payReferencia.trim() || null,
            notas: payNotas.trim() || null,
            pagado_at: new Date().toISOString(),
          });
        } catch (payErr) {
          pagoExito = false;
          pagoErrorMsg = errorMessage(payErr, 'error desconocido');
        }
      }

      if (!includePayment || pagoExito) {
        toast.success(`Reserva ${booking.codigo} creada${includePayment ? ` · pago de ${formatCurrency(Number(payMonto), booking.moneda)} registrado` : ''}`);
      } else {
        // Reserva sí, pago no — un único mensaje claro
        toast.warning(`Reserva ${booking.codigo} creada, pero el pago fallo (${pagoErrorMsg}). Reintenta desde el detalle.`);
      }
      onSaved(booking.id);
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'CONFLICT' || err.code === 'OVERLAP')) {
        setOverlapError(err.message);
        toast.error(err.message);
      } else {
        toast.error(errorMessage(err, 'No se pudo crear la reserva'));
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
                    <button type="button" onClick={() => { setSelectedCustomer(null); setBookingPlaca(''); }} className="text-xs text-muted-foreground hover:text-foreground">Cambiar</button>
                  </div>
                ) : (
                  <>
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-border divide-y">
                      {customerLoading ? (
                        <p className="p-3 text-center text-xs text-muted-foreground">Buscando...</p>
                      ) : customerResults.length === 0 ? (
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
                    {!customerLoading && customerTotal > customerResults.length && (
                      <p className="text-[11px] text-muted-foreground px-1">
                        Mostrando {customerResults.length} de {customerTotal}. Afina la busqueda para ver el resto.
                      </p>
                    )}
                  </>
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
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Placa de vehiculo" value={newCustPlaca} onChange={setNewCustPlaca} placeholder="AB123CD" />
                  <div>
                    <Label>Como nos conocio</Label>
                    <select value={newCustReferral} onChange={(e) => setNewCustReferral(e.target.value as ReferralSource | '')} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm">
                      <option value="">— Sin especificar —</option>
                      {Object.entries(REFERRAL_SOURCE_LABELS).map(([v, label]) => (
                        <option key={v} value={v}>{label}</option>
                      ))}
                    </select>
                  </div>
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
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <Label>Huespedes</Label>
                <input type="number" min={1} value={huespedes} onChange={(e) => setHuespedes(Math.max(1, Number(e.target.value)))} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm" />
              </div>
              <Field label="Placa de vehiculo (esta estancia)" value={bookingPlaca} onChange={setBookingPlaca} placeholder={selectedCustomer?.vehicle_plate ?? 'Opcional'} />
            </div>
            {huespedes > 1 && (
              <p className="text-[11px] text-muted-foreground mt-2 pl-1">
                Los datos de los {huespedes - 1} acompañante{huespedes - 1 > 1 ? 's' : ''} se capturan en el check-in.
              </p>
            )}

            {dateError && (
              <div className="mt-3 flex items-start gap-2 text-xs bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 rounded-xl p-3 border border-red-200 dark:border-red-900">
                <Warning size={16} weight="duotone" className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{dateError}</p>
                  <p>Corrige las fechas para ver habitaciones disponibles y el importe.</p>
                </div>
              </div>
            )}

            {fechaEntrada && fechaSalida && !dateError && (
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
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded-xl p-3">Buscando disponibilidad...</p>
                ) : available.length === 0 ? (
                  <div className="flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 rounded-xl p-3 border border-amber-200 dark:border-amber-900">
                    <Warning size={16} weight="duotone" className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Sin habitaciones disponibles</p>
                      <p>Todas las habitaciones para esas fechas estan ocupadas o no caben los huespedes. Cambia las fechas o reduce los huespedes.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-0.5">
                    {available
                      .filter((r) => !roomSearch || r.numero.toLowerCase().includes(roomSearch.toLowerCase()))
                      .map((r) => {
                        const tarifa = period === 'dia' ? r.tarifa_dia : period === 'semana' ? r.tarifa_semana : r.tarifa_mes;
                        return (
                          <button key={r.id} type="button" onClick={() => setRoomId(r.id)} className={`text-left p-3 rounded-xl border transition-all ${roomId === r.id ? 'border-primary bg-primary/5 ring-2 ring-primary/30' : 'border-border bg-card hover:bg-muted/30'}`}>
                            <p className="font-bold">Hab. {r.numero}</p>
                            <p className="text-[11px] text-muted-foreground">{r.room_type}{r.planta ? ` · planta ${r.planta}` : ''}</p>
                            <p className="text-xs font-semibold mt-1">{formatCurrency(tarifa, r.moneda)} / {period}</p>
                          </button>
                        );
                      })}
                  </div>
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
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{formatCurrency(calc.tarifa, calc.moneda)} × {calc.unidades} {period}{calc.unidades > 1 ? 's' : ''}</span><span className="tabular-nums">{formatCurrency(calc.subtotal, calc.moneda)}</span></div>
                {calc.descPctValor > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Descuento {descuentoPct}%</span><span className="tabular-nums">−{formatCurrency(calc.descPctValor, calc.moneda)}</span></div>}
                {descuentoMonto > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Descuento fijo</span><span className="tabular-nums">−{formatCurrency(descuentoMonto, calc.moneda)}</span></div>}
                <div className="flex justify-between border-t border-border pt-1.5 mt-1.5 font-bold"><span>Total</span><span className="tabular-nums text-base">{formatCurrency(calc.total, calc.moneda)}</span></div>
              </div>
              {calc.descuentoExcedido && (
                <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <Warning size={12} weight="duotone" /> El descuento fijo supera el subtotal. El total se ajusto a 0.
                </p>
              )}
            </Section>
          )}

          {/* === 4. PAGO INICIAL === */}
          <Section title="4 · Pago inicial (opcional)" subtitle="Registra un pago al crear la reserva o dejala como cuenta por cobrar">
            <label className="flex items-center gap-2 text-sm cursor-pointer mb-3">
              <input type="checkbox" checked={includePayment} onChange={(e) => setIncludePayment(e.target.checked)} />
              <CurrencyCircleDollar size={16} weight="duotone" className="text-primary" />
              Registrar pago ahora
            </label>
            {includePayment && (
              <div className="space-y-3 pl-6">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Metodo</Label>
                    <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm">
                      {PAYMENT_METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Monto {calc ? `(en ${calc.moneda})` : ''}</Label>
                    <input type="number" min={0} step="0.01" value={payMonto} onChange={(e) => setPayMonto(e.target.value)} placeholder={calc ? String(calc.total.toFixed(2)) : '0.00'} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm" />
                  </div>
                </div>
                {payExcedeTotal && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <Warning size={12} weight="duotone" /> El monto del pago supera el total de la reserva ({calc && formatCurrency(calc.total, calc.moneda)}).
                  </p>
                )}
                <Field label="Referencia (numero, ultimos digitos, etc.)" value={payReferencia} onChange={setPayReferencia} />
                <div>
                  <Label>Notas del pago</Label>
                  <textarea value={payNotas} onChange={(e) => setPayNotas(e.target.value)} rows={2} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm" placeholder="Detalle del pago, banco, etc." />
                </div>
                <p className="text-[11px] text-muted-foreground">Adjunta el comprobante (foto/PDF) desde la reserva luego de crearla.</p>
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

          <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-card border-t border-border flex flex-wrap items-center gap-2">
            <button type="submit" disabled={!canSubmit || submitting} className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-50">
              {submitting ? 'Creando...' : 'Crear reserva'}
            </button>
            <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
            {/* Decir que falta, en vez de dejar el boton gris sin explicacion. */}
            {!canSubmit && !submitting && (
              <p className="text-[11px] text-muted-foreground basis-full sm:basis-auto">
                Falta: {missing.join(', ')}.
              </p>
            )}
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
