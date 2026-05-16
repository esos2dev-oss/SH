// Logica de bookings: cálculo automatico, validacion de solapamiento, transiciones de estado.

import { withTransaction, pool } from '../../shared/config/db.js';
import { Errors, AppError } from '../../shared/utils/app-error.js';
import { logAudit } from '../../shared/services/audit.service.js';
import { nextCode } from '../../shared/services/code-generator.service.js';
import { diffDias, diffSemanas, diffMeses } from '../../shared/utils/dates.js';
import * as model from './bookings.model.js';
import * as paymentsService from '../payments/payments.service.js';
import type { PaymentPublic } from '../payments/payments.types.js';
import type { CreatePaymentInput as PaymentsCreateInput } from '../payments/payments.validation.js';
import type {
  CreateBookingInput,
  UpdateBookingInput,
  MoveBookingInput,
  ListBookingsQuery,
  CalendarQuery,
  AvailabilityQuery,
  CancelInput,
} from './bookings.validation.js';
import type {
  BookingWithJoins,
  BookingPaymentRow,
  BookingPeriod,
} from './bookings.types.js';

export interface BookingPublic {
  id: number;
  codigo: string;
  period: BookingPeriod;
  fecha_entrada: string;
  fecha_salida: string;
  huespedes: number;
  tarifa_aplicada: number;
  descuento_pct: number;
  descuento_monto: number;
  importe_total: number;
  importe_pagado: number;
  importe_pendiente: number;
  moneda: string;
  payment_status: string;
  status: string;
  origen: string;
  notas: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  customer: { id: number; nombre: string; email: string | null };
  room: { id: number; numero: string; planta: string | null; type: string };
  created_by: number;
  created_at: string;
  updated_at: string;
}

function toPublic(b: BookingWithJoins): BookingPublic {
  const total = Number(b.importe_total);
  const paid = Number(b.importe_pagado);
  return {
    id: b.id,
    codigo: b.codigo,
    period: b.period,
    fecha_entrada: b.fecha_entrada.toISOString(),
    fecha_salida: b.fecha_salida.toISOString(),
    huespedes: b.huespedes,
    tarifa_aplicada: Number(b.tarifa_aplicada),
    descuento_pct: Number(b.descuento_pct),
    descuento_monto: Number(b.descuento_monto),
    importe_total: total,
    importe_pagado: paid,
    importe_pendiente: Math.max(0, total - paid),
    moneda: b.moneda,
    payment_status: b.payment_status,
    status: b.status,
    origen: b.origen,
    notas: b.notas,
    cancelled_at: b.cancelled_at ? b.cancelled_at.toISOString() : null,
    cancelled_reason: b.cancelled_reason,
    customer: {
      id: b.customer_id,
      nombre: `${b.customer_nombres} ${b.customer_apellidos}`,
      email: b.customer_email,
    },
    room: {
      id: b.room_id,
      numero: b.room_numero,
      planta: b.room_planta,
      type: b.room_type_nombre,
    },
    created_by: b.created_by,
    created_at: b.created_at.toISOString(),
    updated_at: b.updated_at.toISOString(),
  };
}

function unitsAndTariff(period: BookingPeriod, fechaEntrada: Date, fechaSalida: Date, rt: { tarifa_dia: string; tarifa_semana: string | null; tarifa_mes: string | null }): { unidades: number; tarifa: number } {
  if (period === 'dia') {
    const noches = diffDias(fechaEntrada, fechaSalida);
    return { unidades: Math.max(1, noches), tarifa: Number(rt.tarifa_dia) };
  }
  if (period === 'semana') {
    if (!rt.tarifa_semana) throw Errors.validation('El tipo de habitacion no tiene tarifa semanal');
    return { unidades: Math.max(1, diffSemanas(fechaEntrada, fechaSalida)), tarifa: Number(rt.tarifa_semana) };
  }
  if (!rt.tarifa_mes) throw Errors.validation('El tipo de habitacion no tiene tarifa mensual');
  return { unidades: Math.max(1, diffMeses(fechaEntrada, fechaSalida)), tarifa: Number(rt.tarifa_mes) };
}

export async function list(filters: ListBookingsQuery): Promise<{ items: BookingPublic[]; total: number }> {
  const r = await model.list(filters);
  return { items: r.items.map(toPublic), total: r.total };
}

export async function getById(id: number): Promise<BookingPublic> {
  const b = await model.findById(id);
  if (!b) throw Errors.notFound('Reserva no encontrada');
  return toPublic(b);
}

export async function calendar(q: CalendarQuery): Promise<BookingPublic[]> {
  const items = await model.calendar(q);
  return items.map(toPublic);
}

export async function availability(q: AvailabilityQuery): Promise<Array<{
  id: number; numero: string; planta: string | null; room_type: string; tarifa_dia: number;
}>> {
  const params: unknown[] = [q.dateFrom, q.dateTo];
  let where = `WHERE r.active = true`;
  if (q.room_type_id) { params.push(q.room_type_id); where += ` AND r.room_type_id = $${params.length}`; }
  if (q.huespedes) { params.push(q.huespedes); where += ` AND rt.capacidad >= $${params.length}`; }
  const sql = `
    SELECT r.id, r.numero, r.planta, rt.nombre AS room_type, rt.tarifa_dia
      FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
     ${where}
       AND NOT EXISTS (
         SELECT 1 FROM bookings b
          WHERE b.room_id = r.id
            AND b.status IN ('pendiente','confirmada','en_curso')
            AND tstzrange(b.fecha_entrada, b.fecha_salida, '[)') &&
                tstzrange($1::timestamptz, $2::timestamptz, '[)')
       )
     ORDER BY r.planta NULLS FIRST, r.numero
  `;
  const { rows } = await pool.query<{ id: number; numero: string; planta: string | null; room_type: string; tarifa_dia: string }>(sql, params);
  return rows.map((r) => ({ ...r, tarifa_dia: Number(r.tarifa_dia) }));
}

export async function create(input: CreateBookingInput, actorId: number): Promise<BookingPublic> {
  return withTransaction(async (client) => {
    // Cargar room + room_type
    const { rows: roomRows } = await client.query<{ id: number; active: boolean; tarifa_dia: string; tarifa_semana: string | null; tarifa_mes: string | null; moneda: string }>(
      `SELECT r.id, r.active, rt.tarifa_dia, rt.tarifa_semana, rt.tarifa_mes, rt.moneda
         FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
        WHERE r.id = $1`,
      [input.room_id],
    );
    const room = roomRows[0];
    if (!room) throw Errors.notFound('Habitacion no encontrada');
    if (!room.active) throw Errors.validation('La habitacion esta inactiva');

    // Customer existe
    const { rowCount: cExists } = await client.query(`SELECT 1 FROM customers WHERE id = $1 AND active = true`, [input.customer_id]);
    if (!cExists) throw Errors.notFound('Huesped no encontrado o inactivo');

    // Solapamiento
    if (await model.checkOverlap(input.room_id, input.fecha_entrada, input.fecha_salida, null, client)) {
      throw new AppError('La habitacion ya esta reservada en ese periodo', 409, 'OVERLAP_CONFLICT');
    }

    // Calculo
    const { unidades, tarifa } = unitsAndTariff(input.period, new Date(input.fecha_entrada), new Date(input.fecha_salida), room);

    const descuentoPct = input.descuento_pct ?? 0;
    const descuentoMonto = input.descuento_monto ?? 0;

    const subtotal = tarifa * unidades;
    const descontadoPct = subtotal * (descuentoPct / 100);
    const importeTotal = Math.max(0, subtotal - descontadoPct - descuentoMonto);

    const codigo = await nextCode('BK', new Date().getFullYear(), client);
    const inserted = await model.insert(
      {
        codigo,
        customer_id: input.customer_id,
        room_id: input.room_id,
        period: input.period,
        fecha_entrada: input.fecha_entrada,
        fecha_salida: input.fecha_salida,
        huespedes: input.huespedes,
        tarifa_aplicada: tarifa,
        descuento_pct: descuentoPct,
        descuento_monto: descuentoMonto,
        importe_total: Math.round(importeTotal * 100) / 100,
        moneda: room.moneda,
        notas: input.notas ?? null,
        created_by: actorId,
      },
      client,
    );

    await logAudit(
      {
        userId: actorId,
        action: 'create',
        entity: 'bookings',
        entityId: inserted.id,
        after: { codigo, importe_total: importeTotal, room_id: input.room_id, customer_id: input.customer_id },
      },
      client,
    );

    const full = await model.findById(inserted.id, client);
    if (!full) throw Errors.internal();
    return toPublic(full);
  });
}

export async function move(id: number, input: MoveBookingInput, actorId: number): Promise<BookingPublic> {
  return withTransaction(async (client) => {
    const before = await model.findById(id, client);
    if (!before) throw Errors.notFound('Reserva no encontrada');
    if (!['pendiente', 'confirmada', 'en_curso'].includes(before.status)) {
      throw Errors.validation(`No se puede mover una reserva en estado ${before.status}`);
    }

    const newRoomId = input.room_id ?? before.room_id;
    const newFE = input.fecha_entrada ?? before.fecha_entrada.toISOString();
    const newFS = input.fecha_salida ?? before.fecha_salida.toISOString();

    if (new Date(newFS) <= new Date(newFE)) {
      throw Errors.validation('fecha_salida debe ser posterior a fecha_entrada');
    }

    if (await model.checkOverlap(newRoomId, newFE, newFS, id, client)) {
      throw new AppError('La habitacion ya esta reservada en ese periodo', 409, 'OVERLAP_CONFLICT');
    }

    await client.query(
      `UPDATE bookings SET room_id = $1, fecha_entrada = $2::timestamptz, fecha_salida = $3::timestamptz, updated_at = NOW() WHERE id = $4`,
      [newRoomId, newFE, newFS, id],
    );

    await logAudit({
      userId: actorId,
      action: 'update',
      entity: 'bookings',
      entityId: id,
      before: { room_id: before.room_id, fecha_entrada: before.fecha_entrada, fecha_salida: before.fecha_salida },
      after: { room_id: newRoomId, fecha_entrada: newFE, fecha_salida: newFS },
    }, client);

    const full = await model.findById(id, client);
    if (!full) throw Errors.internal();
    return toPublic(full);
  });
}

export async function update(id: number, input: UpdateBookingInput, actorId: number): Promise<BookingPublic> {
  const before = await model.findById(id);
  if (!before) throw Errors.notFound('Reserva no encontrada');
  if (!['pendiente', 'confirmada'].includes(before.status)) {
    throw Errors.validation('Solo se pueden editar reservas pendientes o confirmadas');
  }
  await model.updateBasic(id, input);
  const full = await model.findById(id);
  if (!full) throw Errors.internal();
  await logAudit({
    userId: actorId,
    action: 'update',
    entity: 'bookings',
    entityId: id,
    before: { huespedes: before.huespedes, notas: before.notas },
    after: { huespedes: full.huespedes, notas: full.notas },
  });
  return toPublic(full);
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pendiente: ['confirmada', 'cancelada'],
  confirmada: ['en_curso', 'cancelada', 'no_show'],
  en_curso: ['finalizada'],
};

export async function transition(
  id: number,
  to: 'confirmada' | 'cancelada' | 'no_show' | 'en_curso' | 'finalizada',
  actorId: number,
  reason: string | null = null,
): Promise<BookingPublic> {
  return withTransaction(async (client) => {
    const before = await model.findById(id, client);
    if (!before) throw Errors.notFound('Reserva no encontrada');
    const allowed = VALID_TRANSITIONS[before.status] ?? [];
    if (!allowed.includes(to)) {
      throw Errors.validation(`No se puede pasar de ${before.status} a ${to}`);
    }
    await model.updateStatus(id, to, { cancelled_reason: to === 'cancelada' ? reason : null }, client);
    await logAudit(
      {
        userId: actorId,
        action: 'status_change',
        entity: 'bookings',
        entityId: id,
        before: { status: before.status },
        after: { status: to, reason },
      },
      client,
    );
    const full = await model.findById(id, client);
    if (!full) throw Errors.internal();
    return toPublic(full);
  });
}

export async function cancel(id: number, input: CancelInput, actorId: number): Promise<BookingPublic> {
  return transition(id, 'cancelada', actorId, input.reason);
}

// Payments — wrappers que delegan al modulo payments para mantener compatibilidad
// con la ruta legacy POST/GET /api/bookings/:id/payments.

export async function listPayments(bookingId: number): Promise<BookingPaymentRow[]> {
  const exists = await model.findById(bookingId);
  if (!exists) throw Errors.notFound('Reserva no encontrada');
  return model.listPayments(bookingId);
}

export async function addPayment(
  bookingId: number,
  input: PaymentsCreateInput,
  actorId: number,
  actorRole: string | null,
): Promise<{ payment: PaymentPublic; booking: BookingPublic }> {
  // Forzar el booking_id desde el path
  const payment = await paymentsService.create(
    { ...input, booking_id: bookingId },
    actorId,
    actorRole,
  );
  const booking = await getById(bookingId);
  return { payment, booking };
}
