// Logica de negocio del modulo payments.
// Responsabilidades:
//  - Crear pagos con conversion de moneda y estado de confirmacion segun metodo.
//  - Confirmar / rechazar pagos.
//  - Mantener bookings.importe_pagado y payment_status sincronizados.
//  - Estado de cuenta de huesped y de reserva.
//  - Tasa BCV (CRUD basico).

import { withTransaction, pool } from '../../shared/config/db.js';
import { Errors, AppError } from '../../shared/utils/app-error.js';
import { logAudit } from '../../shared/services/audit.service.js';
import { nextCode } from '../../shared/services/code-generator.service.js';
import * as model from './payments.model.js';
import type {
  PaymentWithJoins,
  PaymentPublic,
  PaymentConfirmationStatus,
  PaymentMethod,
  CustomerStatement,
  BookingStatement,
  StatementLine,
  StatementSummary,
} from './payments.types.js';
import type {
  CreatePaymentInput,
  UpdatePaymentInput,
  ListPaymentsQuery,
  ExchangeRateUpsertInput,
  LookupQuery,
} from './payments.validation.js';

// =============================================================================
// Helpers de moneda y configuracion
// =============================================================================

const PENDING_BY_DEFAULT: ReadonlySet<PaymentMethod> = new Set(['pago_movil', 'transferencia']);

/** Lee `hotel.moneda` de settings; default USD. */
async function getBaseCurrency(): Promise<string> {
  const { rows } = await pool.query<{ value: unknown }>(
    `SELECT value FROM settings WHERE key = 'hotel.moneda' LIMIT 1`,
  );
  const v = rows[0]?.value;
  if (typeof v === 'string') return v.toUpperCase();
  return 'USD';
}

/**
 * Resuelve la tasa Bs/USD a usar para una fecha:
 *  1. Si el input la fuerza, esa.
 *  2. Tasa registrada en exchange_rates para esa fecha.
 *  3. Ultima tasa registrada (max 7 dias atras).
 *  4. null si no hay nada y la conversion es necesaria.
 */
async function resolveRate(fecha: string, forced: number | null | undefined): Promise<number | null> {
  if (forced && forced > 0) return forced;
  const same = await model.getRate(fecha);
  if (same) return Number(same.bs_per_usd);
  const latest = await model.latestRate();
  if (!latest) return null;
  const diffDays = Math.abs(new Date(fecha).getTime() - latest.fecha.getTime()) / 86_400_000;
  if (diffDays > 7) return null;
  return Number(latest.bs_per_usd);
}

/** Convierte `monto` en `monedaPago` a la moneda base. Si son iguales, regresa monto. */
async function convertToBase(monto: number, monedaPago: string, baseCurrency: string, fecha: string, forcedRate: number | null | undefined): Promise<{ monto_base: number; tasa: number | null }> {
  if (monedaPago === baseCurrency) {
    return { monto_base: round2(monto), tasa: null };
  }
  // Solo soportamos VES <-> USD por ahora (caso real venezolano)
  if ((monedaPago === 'VES' && baseCurrency === 'USD') || (monedaPago === 'USD' && baseCurrency === 'VES')) {
    const tasa = await resolveRate(fecha, forcedRate);
    if (!tasa) throw Errors.validation(`No hay tasa de cambio registrada para ${fecha}. Configurela en Settings o pase tasa_cambio en el body.`);
    if (monedaPago === 'VES') return { monto_base: round2(monto / tasa), tasa };
    return { monto_base: round2(monto * tasa), tasa };
  }
  throw Errors.validation(`Conversion entre ${monedaPago} y ${baseCurrency} no soportada`);
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10_000) / 10_000; }

function defaultStatusFor(method: PaymentMethod, forced: PaymentConfirmationStatus | undefined, actorRole: string | null): PaymentConfirmationStatus {
  if (forced) {
    // Solo admin/superadmin pueden saltar pending_confirmation
    if (forced === 'confirmed' && PENDING_BY_DEFAULT.has(method) && actorRole !== 'admin' && actorRole !== 'superadmin') {
      return 'pending_confirmation';
    }
    return forced;
  }
  return PENDING_BY_DEFAULT.has(method) ? 'pending_confirmation' : 'confirmed';
}

// =============================================================================
// Mapper a forma publica
// =============================================================================

export function toPublic(p: PaymentWithJoins): PaymentPublic {
  const customerId = p.customer_id ?? null;
  let customer: PaymentPublic['customer'] = null;
  if (p.customer_nombres) {
    customer = {
      id: customerId ?? -1,
      nombre: `${p.customer_nombres} ${p.customer_apellidos ?? ''}`.trim(),
      telefono: p.customer_telefono,
      doc_numero: p.customer_doc_numero,
    };
  }
  return {
    id: p.id,
    booking: p.booking_id !== null && p.booking_codigo ? { id: p.booking_id, codigo: p.booking_codigo, status: p.booking_status ?? '' } : null,
    customer,
    monto: Number(p.monto),
    moneda: p.moneda,
    monto_base: p.monto_base !== null ? Number(p.monto_base) : null,
    tasa_cambio: p.tasa_cambio !== null ? Number(p.tasa_cambio) : null,
    method: p.method,
    method_details: p.method_details ?? {},
    referencia: p.referencia,
    pagado_at: p.pagado_at.toISOString(),
    status: p.status,
    registered_by: p.registered_by,
    confirmed_at: p.confirmed_at ? p.confirmed_at.toISOString() : null,
    rejected_at: p.rejected_at ? p.rejected_at.toISOString() : null,
    rejected_reason: p.rejected_reason,
    ledger_entry_id: p.ledger_entry_id,
    bank_match_id: p.bank_match_id,
    receipt_url: p.receipt_url ?? null,
    receipt_mime: p.receipt_mime ?? null,
    notas: p.notas,
    created_at: p.created_at.toISOString(),
  };
}

// =============================================================================
// Public API
// =============================================================================

export async function list(filters: ListPaymentsQuery): Promise<{ items: PaymentPublic[]; total: number }> {
  const r = await model.list(filters);
  return { items: r.items.map(toPublic), total: r.total };
}

export async function getById(id: number): Promise<PaymentPublic> {
  const p = await model.findById(id);
  if (!p) throw Errors.notFound('Pago no encontrado');
  return toPublic(p);
}

export async function quickLookup(q: LookupQuery): Promise<Awaited<ReturnType<typeof model.quickLookup>>> {
  return model.quickLookup(q.q);
}

export async function update(id: number, input: UpdatePaymentInput, actorId: number): Promise<PaymentPublic> {
  const before = await model.findById(id);
  if (!before) throw Errors.notFound('Pago no encontrado');
  if (before.status === 'rejected') throw Errors.validation('No se puede editar un pago rechazado');
  await model.updateBasic(id, input);
  const full = await model.findById(id);
  if (!full) throw Errors.internal();
  await logAudit({
    userId: actorId,
    action: 'update',
    entity: 'booking_payments',
    entityId: id,
    before: { notas: before.notas, referencia: before.referencia },
    after: { notas: full.notas, referencia: full.referencia },
  });
  return toPublic(full);
}

// -----------------------------------------------------------------------------
// create
// -----------------------------------------------------------------------------

export async function create(input: CreatePaymentInput, actorId: number, actorRole: string | null): Promise<PaymentPublic> {
  return withTransaction(async (client) => {
    // 1. Resolver target (booking o customer)
    let bookingId: number | null = input.booking_id ?? null;
    let customerId: number | null = input.customer_id ?? null;
    let bookingCodigo: string | null = null;
    let monedaReserva: string | null = null;
    let importePendiente: number | null = null;

    if (bookingId !== null) {
      const b = await model.bookingForPayment(bookingId, client);
      if (!b) throw Errors.notFound('Reserva no encontrada');
      bookingCodigo = b.codigo;
      monedaReserva = b.moneda;
      const total = Number(b.importe_total);
      const paid = Number(b.importe_pagado_calc);
      importePendiente = round2(total - paid);
      // Si no se paso customer_id, lo derivamos del booking
      if (customerId === null) customerId = b.customer_id;
    } else if (customerId !== null) {
      const { rowCount } = await client.query(`SELECT 1 FROM customers WHERE id = $1 AND active = true`, [customerId]);
      if (!rowCount) throw Errors.notFound('Huesped no encontrado o inactivo');
    }

    // 2. Determinar moneda del pago
    const monedaPago = input.moneda.toUpperCase();
    if (bookingId !== null && monedaReserva && monedaPago !== monedaReserva) {
      // Permitir distinta moneda: la conversion la maneja convertToBase + monto_base.
      // No bloqueamos para que un huesped pueda pagar Bs sobre una reserva en USD.
    }

    // 3. Resolver tasa y monto en moneda base
    const baseCurrency = await getBaseCurrency();
    const fechaPago = input.pagado_at ? input.pagado_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const { monto_base, tasa } = await convertToBase(input.monto, monedaPago, baseCurrency, fechaPago, input.tasa_cambio ?? null);

    // 4. Validar que no exceda total (solo para pagos asociados a reserva)
    //    Convertimos siempre a moneda de la reserva para comparar.
    if (bookingId !== null && monedaReserva && importePendiente !== null) {
      const equivalenteEnMonedaReserva = monedaPago === monedaReserva
        ? input.monto
        : (monedaReserva === baseCurrency
            ? monto_base
            : (tasa ? round2(monto_base * tasa) : 0));
      // tolerancia 0.5% para redondeos por conversion
      const tolerancia = Math.max(0.01, importePendiente * 0.005);
      if (equivalenteEnMonedaReserva > importePendiente + tolerancia) {
        throw new AppError(
          `El pago excede el saldo pendiente (${importePendiente} ${monedaReserva})`,
          409,
          'PAYMENT_EXCEEDS_TOTAL',
        );
      }
    }

    // 5. Determinar status inicial
    const method = input.method;
    const status = defaultStatusFor(method, input.force_status, actorRole);

    // 6. Crear ledger_entry SOLO si confirmed (los pendientes no contabilizan)
    let ledgerEntryId: number | null = null;
    if (status === 'confirmed') {
      ledgerEntryId = await createLedgerEntryForPayment(client, {
        monto_base,
        moneda_base: baseCurrency,
        fecha: fechaPago,
        descripcion: bookingCodigo ? `Pago reserva ${bookingCodigo}` : `Pago suelto huesped #${customerId ?? '?'}`,
        method,
        bookingId,
        customerId,
        actorId,
      });
    }

    // 7. Insertar payment
    const payment = await model.insert(
      {
        booking_id: bookingId,
        customer_id: customerId,
        monto: input.monto,
        moneda: monedaPago,
        monto_base,
        tasa_cambio: tasa !== null ? round4(tasa) : null,
        method,
        method_details: input.method_details ?? {},
        referencia: input.referencia ?? null,
        pagado_at: input.pagado_at ?? null,
        registered_by: actorId,
        ledger_entry_id: ledgerEntryId,
        status,
        notas: input.notas ?? null,
        receipt_url: input.receipt_url ?? null,
        receipt_mime: input.receipt_mime ?? null,
      },
      client,
    );

    // 8. Recompute booking si aplica
    if (bookingId !== null) {
      await model.recomputeBookingPayment(bookingId, client);
    }

    // 9. Audit
    await logAudit(
      {
        userId: actorId,
        action: 'create',
        entity: 'booking_payments',
        entityId: payment.id,
        after: {
          booking_id: bookingId,
          customer_id: customerId,
          method,
          monto: input.monto,
          moneda: monedaPago,
          monto_base,
          status,
        },
      },
      client,
    );

    const full = await model.findById(payment.id, client);
    if (!full) throw Errors.internal();
    return toPublic(full);
  });
}

// -----------------------------------------------------------------------------
// confirm / reject
// -----------------------------------------------------------------------------

export async function confirm(id: number, actorId: number): Promise<PaymentPublic> {
  return withTransaction(async (client) => {
    const before = await model.findById(id, client);
    if (!before) throw Errors.notFound('Pago no encontrado');
    if (before.status === 'confirmed') throw Errors.validation('El pago ya esta confirmado');
    if (before.status === 'rejected') throw Errors.validation('No se puede confirmar un pago rechazado. Registre uno nuevo.');

    // Crear ledger_entry si aun no existe
    let ledgerEntryId = before.ledger_entry_id;
    if (ledgerEntryId === null) {
      const baseCurrency = await getBaseCurrency();
      const fecha = before.pagado_at.toISOString().slice(0, 10);
      ledgerEntryId = await createLedgerEntryForPayment(client, {
        monto_base: Number(before.monto_base ?? before.monto),
        moneda_base: baseCurrency,
        fecha,
        descripcion: before.booking_codigo ? `Pago reserva ${before.booking_codigo}` : `Pago suelto huesped #${before.customer_id ?? '?'}`,
        method: before.method,
        bookingId: before.booking_id,
        customerId: before.customer_id,
        actorId,
      });
      await client.query(`UPDATE booking_payments SET ledger_entry_id = $2 WHERE id = $1`, [id, ledgerEntryId]);
    }

    await model.setConfirmed(id, actorId, client);

    if (before.booking_id !== null) {
      await model.recomputeBookingPayment(before.booking_id, client);
    }

    await logAudit({
      userId: actorId,
      action: 'status_change',
      entity: 'booking_payments',
      entityId: id,
      before: { status: before.status },
      after: { status: 'confirmed' },
    }, client);

    const full = await model.findById(id, client);
    if (!full) throw Errors.internal();
    return toPublic(full);
  });
}

export async function reject(id: number, reason: string, actorId: number): Promise<PaymentPublic> {
  return withTransaction(async (client) => {
    const before = await model.findById(id, client);
    if (!before) throw Errors.notFound('Pago no encontrado');
    if (before.status === 'rejected') throw Errors.validation('El pago ya esta rechazado');

    // Si tenia ledger_entry asociado, anularlo
    if (before.ledger_entry_id !== null) {
      // marcamos el ledger como anulado
      await client.query(`UPDATE ledger_entries SET status = 'anulado' WHERE id = $1`, [before.ledger_entry_id]);
    }

    await model.setRejected(id, actorId, reason, client);

    if (before.booking_id !== null) {
      await model.recomputeBookingPayment(before.booking_id, client);
    }

    await logAudit({
      userId: actorId,
      action: 'status_change',
      entity: 'booking_payments',
      entityId: id,
      before: { status: before.status },
      after: { status: 'rejected', reason },
    }, client);

    const full = await model.findById(id, client);
    if (!full) throw Errors.internal();
    return toPublic(full);
  });
}

// -----------------------------------------------------------------------------
// Statements
// -----------------------------------------------------------------------------

export async function customerStatement(customerId: number): Promise<CustomerStatement> {
  const { rows } = await pool.query<{ id: number; nombres: string; apellidos: string; telefono: string | null; doc_numero: string | null }>(
    `SELECT id, nombres, apellidos, telefono, doc_numero FROM customers WHERE id = $1`,
    [customerId],
  );
  const c = rows[0];
  if (!c) throw Errors.notFound('Huesped no encontrado');

  const bookings = await model.bookingsByCustomer(customerId);
  const customerInfo = { id: c.id, nombre: `${c.nombres} ${c.apellidos}`, telefono: c.telefono, doc_numero: c.doc_numero };

  const bookingsOut: CustomerStatement['bookings'] = [];
  let totalCargosAll = 0;
  let totalPagadoConfAll = 0;
  let totalPagadoPendAll = 0;
  let monedaAcumulada: string | null = null;

  for (const b of bookings) {
    const payments = await model.paymentsByBooking(b.id);
    const lines: StatementLine[] = [];
    const total = Number(b.importe_total);

    lines.push({
      kind: 'charge',
      id: `b-${b.id}`,
      fecha: b.fecha_entrada.toISOString(),
      descripcion: `Alojamiento reserva ${b.codigo}`,
      monto: total,
      moneda: b.moneda,
    });

    let totalConf = 0;
    let totalPend = 0;
    for (const p of payments) {
      lines.push({
        kind: 'payment',
        id: p.id,
        fecha: p.pagado_at.toISOString(),
        descripcion: `Pago via ${labelMethod(p.method)}` + (p.referencia ? ` (ref ${p.referencia})` : ''),
        monto: Number(p.monto),
        moneda: p.moneda,
        method: p.method,
        status: p.status,
        referencia: p.referencia,
      });
      if (p.status === 'confirmed') totalConf += Number(p.monto);
      else if (p.status === 'pending_confirmation') totalPend += Number(p.monto);
    }

    const summary: StatementSummary = {
      moneda: b.moneda,
      total_cargos: round2(total),
      total_pagado_confirmado: round2(totalConf),
      total_pagado_pendiente: round2(totalPend),
      saldo: round2(total - totalConf - totalPend),
      saldo_efectivo: round2(total - totalConf),
    };

    bookingsOut.push({
      booking: {
        id: b.id,
        codigo: b.codigo,
        status: b.status,
        fecha_entrada: b.fecha_entrada.toISOString(),
        fecha_salida: b.fecha_salida.toISOString(),
      },
      summary,
      lines,
    });

    totalCargosAll += total;
    totalPagadoConfAll += totalConf;
    totalPagadoPendAll += totalPend;
    monedaAcumulada = monedaAcumulada ?? b.moneda;
  }

  const loose = await model.loosePaymentsByCustomer(customerId);
  const loosePublic: PaymentPublic[] = [];
  for (const lp of loose) {
    const full = await model.findById(lp.id);
    if (full) loosePublic.push(toPublic(full));
  }

  const totals: StatementSummary = {
    moneda: monedaAcumulada ?? 'USD',
    total_cargos: round2(totalCargosAll),
    total_pagado_confirmado: round2(totalPagadoConfAll),
    total_pagado_pendiente: round2(totalPagadoPendAll),
    saldo: round2(totalCargosAll - totalPagadoConfAll - totalPagadoPendAll),
    saldo_efectivo: round2(totalCargosAll - totalPagadoConfAll),
  };

  return { customer: customerInfo, bookings: bookingsOut, loose_payments: loosePublic, totals };
}

export async function bookingStatement(bookingId: number): Promise<BookingStatement> {
  const { rows } = await pool.query<{
    id: number; codigo: string; status: string; fecha_entrada: Date; fecha_salida: Date;
    importe_total: string; moneda: string;
    customer_id: number; nombres: string; apellidos: string; telefono: string | null;
  }>(
    `SELECT b.id, b.codigo, b.status, b.fecha_entrada, b.fecha_salida, b.importe_total, b.moneda,
            c.id AS customer_id, c.nombres, c.apellidos, c.telefono
       FROM bookings b
       JOIN customers c ON c.id = b.customer_id
      WHERE b.id = $1`,
    [bookingId],
  );
  const b = rows[0];
  if (!b) throw Errors.notFound('Reserva no encontrada');

  const payments = await model.paymentsByBooking(bookingId);
  const total = Number(b.importe_total);

  const lines: StatementLine[] = [
    {
      kind: 'charge',
      id: `b-${b.id}`,
      fecha: b.fecha_entrada.toISOString(),
      descripcion: `Alojamiento reserva ${b.codigo}`,
      monto: total,
      moneda: b.moneda,
    },
  ];

  let totalConf = 0;
  let totalPend = 0;
  for (const p of payments) {
    lines.push({
      kind: 'payment',
      id: p.id,
      fecha: p.pagado_at.toISOString(),
      descripcion: `Pago via ${labelMethod(p.method)}` + (p.referencia ? ` (ref ${p.referencia})` : ''),
      monto: Number(p.monto),
      moneda: p.moneda,
      method: p.method,
      status: p.status,
      referencia: p.referencia,
    });
    if (p.status === 'confirmed') totalConf += Number(p.monto);
    else if (p.status === 'pending_confirmation') totalPend += Number(p.monto);
  }

  return {
    booking: {
      id: b.id,
      codigo: b.codigo,
      status: b.status,
      fecha_entrada: b.fecha_entrada.toISOString(),
      fecha_salida: b.fecha_salida.toISOString(),
      importe_total: total,
      moneda: b.moneda,
    },
    customer: { id: b.customer_id, nombre: `${b.nombres} ${b.apellidos}`, telefono: b.telefono },
    lines,
    summary: {
      moneda: b.moneda,
      total_cargos: round2(total),
      total_pagado_confirmado: round2(totalConf),
      total_pagado_pendiente: round2(totalPend),
      saldo: round2(total - totalConf - totalPend),
      saldo_efectivo: round2(total - totalConf),
    },
  };
}

// -----------------------------------------------------------------------------
// Exchange rates API
// -----------------------------------------------------------------------------

export async function getCurrentRate(): Promise<{ fecha: string; bs_per_usd: number; source: string } | null> {
  const r = await model.latestRate();
  if (!r) return null;
  return { fecha: r.fecha.toISOString().slice(0, 10), bs_per_usd: Number(r.bs_per_usd), source: r.source };
}

export async function upsertRate(input: ExchangeRateUpsertInput, actorId: number) {
  const fecha = input.fecha ?? new Date().toISOString().slice(0, 10);
  const r = await model.upsertRate(fecha, input.bs_per_usd, input.source, actorId);
  await logAudit({ userId: actorId, action: 'update', entity: 'exchange_rates', entityId: null, after: { fecha, bs_per_usd: input.bs_per_usd, source: input.source } });
  return { fecha: r.fecha.toISOString().slice(0, 10), bs_per_usd: Number(r.bs_per_usd), source: r.source };
}

export async function listRates(limit = 30) {
  const rs = await model.listRates(limit);
  return rs.map((r) => ({ fecha: r.fecha.toISOString().slice(0, 10), bs_per_usd: Number(r.bs_per_usd), source: r.source }));
}

// =============================================================================
// Helpers internos
// =============================================================================

type LedgerCreateParams = {
  monto_base: number;
  moneda_base: string;
  fecha: string;
  descripcion: string;
  method: PaymentMethod;
  bookingId: number | null;
  customerId: number | null;
  actorId: number;
};

async function createLedgerEntryForPayment(client: import('pg').PoolClient, params: LedgerCreateParams): Promise<number> {
  const codigo = await nextCode('LG', new Date(params.fecha).getFullYear(), client);
  const { rows: catRows } = await client.query<{ id: number }>(
    `SELECT id FROM ledger_categories WHERE slug = 'alquiler' AND type = 'ingreso' LIMIT 1`,
  );
  const categoryId = catRows[0]?.id ?? null;
  if (categoryId === null) {
    throw Errors.internal('Categoria ledger "alquiler" no encontrada — verificar seeds');
  }
  // Mapear method PMS → method del enum payment_method (todos validos)
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO ledger_entries
       (codigo, type, category_id, fecha, descripcion, monto, moneda, method, booking_id, customer_id, registered_by)
     VALUES ($1, 'ingreso', $2, $3::date, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      codigo, categoryId, params.fecha,
      params.descripcion, params.monto_base, params.moneda_base, params.method,
      params.bookingId, params.customerId, params.actorId,
    ],
  );
  if (!rows[0]) throw Errors.internal();
  return rows[0].id;
}

function labelMethod(m: PaymentMethod): string {
  const labels: Record<PaymentMethod, string> = {
    efectivo: 'efectivo',
    efectivo_usd: 'efectivo USD',
    efectivo_bs: 'efectivo Bs',
    tarjeta: 'tarjeta',
    transferencia: 'transferencia',
    paypal: 'PayPal',
    pago_movil: 'pago movil',
    zelle: 'Zelle',
    punto_venta: 'punto de venta',
    otro: 'otro',
  };
  return labels[m] ?? m;
}
