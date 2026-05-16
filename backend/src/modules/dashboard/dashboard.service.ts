// Servicio dashboard: agrega datos de varios dominios para la home de recepcion.

import { pool } from '../../shared/config/db.js';
import type {
  DashboardPayload,
  ArrivalToday,
  DepartureToday,
  CleaningPending,
  BirthdayToday,
  RoomBoardItem,
  PendingPaymentItem,
  BookingWithoutPaymentItem,
  TodayKpis,
} from './dashboard.types.js';

async function loadArrivals(today: string): Promise<ArrivalToday[]> {
  const { rows } = await pool.query<{
    booking_id: number; codigo: string; customer_id: number; customer_nombres: string;
    customer_apellidos: string; customer_telefono: string | null;
    room_id: number; room_numero: string;
    fecha_entrada: Date; importe_total: string; importe_pagado: string;
    moneda: string; payment_status: string; status: string;
  }>(
    `SELECT b.id AS booking_id, b.codigo, c.id AS customer_id,
            c.nombres AS customer_nombres, c.apellidos AS customer_apellidos, c.telefono AS customer_telefono,
            r.id AS room_id, r.numero AS room_numero,
            b.fecha_entrada, b.importe_total::text, b.importe_pagado::text,
            b.moneda, b.payment_status, b.status
       FROM bookings b
       JOIN customers c ON c.id = b.customer_id
       JOIN rooms r ON r.id = b.room_id
      WHERE b.fecha_entrada::date = $1::date
        AND b.status IN ('pendiente','confirmada')
      ORDER BY b.fecha_entrada ASC`,
    [today],
  );
  return rows.map((r) => {
    const total = Number(r.importe_total);
    const paid = Number(r.importe_pagado);
    return {
      booking_id: r.booking_id,
      codigo: r.codigo,
      customer_id: r.customer_id,
      customer_nombre: `${r.customer_nombres} ${r.customer_apellidos}`,
      customer_telefono: r.customer_telefono,
      room_id: r.room_id,
      room_numero: r.room_numero,
      fecha_entrada: r.fecha_entrada.toISOString(),
      importe_total: total,
      importe_pagado: paid,
      importe_pendiente: Math.max(0, total - paid),
      moneda: r.moneda,
      payment_status: r.payment_status,
      status: r.status,
    };
  });
}

async function loadDepartures(today: string): Promise<DepartureToday[]> {
  const { rows } = await pool.query<{
    booking_id: number; codigo: string; customer_id: number;
    customer_nombres: string; customer_apellidos: string; customer_telefono: string | null;
    room_id: number; room_numero: string;
    fecha_salida: Date; importe_total: string; importe_pagado: string;
    moneda: string; status: string;
  }>(
    `SELECT b.id AS booking_id, b.codigo, c.id AS customer_id,
            c.nombres AS customer_nombres, c.apellidos AS customer_apellidos, c.telefono AS customer_telefono,
            r.id AS room_id, r.numero AS room_numero,
            b.fecha_salida, b.importe_total::text, b.importe_pagado::text, b.moneda, b.status
       FROM bookings b
       JOIN customers c ON c.id = b.customer_id
       JOIN rooms r ON r.id = b.room_id
      WHERE b.fecha_salida::date = $1::date
        AND b.status IN ('confirmada','en_curso')
      ORDER BY b.fecha_salida ASC`,
    [today],
  );
  return rows.map((r) => {
    const total = Number(r.importe_total);
    const paid = Number(r.importe_pagado);
    return {
      booking_id: r.booking_id,
      codigo: r.codigo,
      customer_id: r.customer_id,
      customer_nombre: `${r.customer_nombres} ${r.customer_apellidos}`,
      customer_telefono: r.customer_telefono,
      room_id: r.room_id,
      room_numero: r.room_numero,
      fecha_salida: r.fecha_salida.toISOString(),
      importe_pendiente: Math.max(0, total - paid),
      moneda: r.moneda,
      status: r.status,
    };
  });
}

async function loadCleanings(): Promise<CleaningPending[]> {
  // status_changed_at podria no existir; usar updated_at de rooms si esta disponible.
  const { rows } = await pool.query<{
    room_id: number; numero: string; planta: string | null; minutes_in_state: number;
  }>(
    `SELECT r.id AS room_id, r.numero, r.planta,
            COALESCE(
              EXTRACT(EPOCH FROM (NOW() - r.updated_at))::int / 60,
              0
            )::int AS minutes_in_state
       FROM rooms r
      WHERE r.status = 'limpieza'
      ORDER BY r.updated_at ASC`,
  );
  return rows.map((r) => ({
    room_id: r.room_id,
    numero: r.numero,
    planta: r.planta,
    minutes_in_state: Number(r.minutes_in_state),
  }));
}

async function loadBirthdays(today: string): Promise<BirthdayToday[]> {
  const d = new Date(today);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const { rows } = await pool.query<{
    customer_id: number; nombres: string; apellidos: string; edad: number;
    telefono: string | null; email: string | null; accepts_marketing: boolean;
  }>(
    `SELECT c.id AS customer_id, c.nombres, c.apellidos,
            EXTRACT(YEAR FROM AGE(c.fecha_nacimiento))::int AS edad,
            c.telefono, c.email, c.accepts_marketing
       FROM customers c
      WHERE c.fecha_nacimiento IS NOT NULL
        AND c.active = true
        AND EXTRACT(MONTH FROM c.fecha_nacimiento)::int = $1
        AND EXTRACT(DAY FROM c.fecha_nacimiento)::int = $2
      ORDER BY c.apellidos, c.nombres`,
    [month, day],
  );
  return rows.map((r) => ({
    customer_id: r.customer_id,
    nombre: `${r.nombres} ${r.apellidos}`,
    edad: r.edad,
    telefono: r.telefono,
    email: r.email,
    accepts_marketing: r.accepts_marketing,
  }));
}

async function loadRoomsBoard(): Promise<RoomBoardItem[]> {
  const { rows } = await pool.query<{
    room_id: number; numero: string; planta: string | null; type: string; status: string;
    bk_id: number | null; bk_codigo: string | null; bk_customer_nombre: string | null;
    bk_fecha_salida: Date | null; bk_importe_total: string | null; bk_importe_pagado: string | null; bk_moneda: string | null;
  }>(
    `SELECT r.id AS room_id, r.numero, r.planta, rt.nombre AS type, r.status,
            b.id AS bk_id, b.codigo AS bk_codigo,
            (c.nombres || ' ' || c.apellidos) AS bk_customer_nombre,
            b.fecha_salida AS bk_fecha_salida,
            b.importe_total::text AS bk_importe_total,
            b.importe_pagado::text AS bk_importe_pagado,
            b.moneda AS bk_moneda
       FROM rooms r
       JOIN room_types rt ON rt.id = r.room_type_id
       LEFT JOIN LATERAL (
         SELECT b1.id, b1.codigo, b1.fecha_salida, b1.importe_total, b1.importe_pagado, b1.moneda, b1.customer_id
           FROM bookings b1
          WHERE b1.room_id = r.id
            AND b1.status IN ('confirmada','en_curso','pendiente')
            AND b1.fecha_salida > NOW()
          ORDER BY b1.fecha_entrada ASC
          LIMIT 1
       ) b ON true
       LEFT JOIN customers c ON c.id = b.customer_id
      WHERE r.active = true
      ORDER BY r.planta NULLS FIRST, r.numero`,
  );
  return rows.map((r) => ({
    room_id: r.room_id,
    numero: r.numero,
    planta: r.planta,
    type: r.type,
    status: r.status,
    current_booking: r.bk_id !== null && r.bk_codigo !== null && r.bk_fecha_salida !== null
      ? {
          id: r.bk_id,
          codigo: r.bk_codigo,
          customer_nombre: r.bk_customer_nombre ?? '',
          fecha_salida: r.bk_fecha_salida.toISOString(),
          importe_pendiente: Math.max(0, Number(r.bk_importe_total ?? 0) - Number(r.bk_importe_pagado ?? 0)),
          moneda: r.bk_moneda ?? 'USD',
        }
      : null,
  }));
}

async function loadPendingPayments(): Promise<PendingPaymentItem[]> {
  const { rows } = await pool.query<{
    payment_id: number; monto: string; moneda: string; method: string;
    referencia: string | null; pagado_at: Date;
    booking_codigo: string | null;
    customer_nombres: string | null; customer_apellidos: string | null;
  }>(
    `SELECT p.id AS payment_id, p.monto::text, p.moneda, p.method, p.referencia, p.pagado_at,
            b.codigo AS booking_codigo,
            COALESCE(c1.nombres, c2.nombres) AS customer_nombres,
            COALESCE(c1.apellidos, c2.apellidos) AS customer_apellidos
       FROM booking_payments p
       LEFT JOIN bookings b ON b.id = p.booking_id
       LEFT JOIN customers c1 ON c1.id = b.customer_id
       LEFT JOIN customers c2 ON c2.id = p.customer_id
      WHERE p.status = 'pending_confirmation'
      ORDER BY p.pagado_at DESC
      LIMIT 20`,
  );
  return rows.map((r) => ({
    payment_id: r.payment_id,
    monto: Number(r.monto),
    moneda: r.moneda,
    method: r.method,
    referencia: r.referencia,
    pagado_at: r.pagado_at.toISOString(),
    booking_codigo: r.booking_codigo,
    customer_nombre: r.customer_nombres ? `${r.customer_nombres} ${r.customer_apellidos ?? ''}`.trim() : null,
  }));
}

async function loadBookingsWithoutPayment(): Promise<BookingWithoutPaymentItem[]> {
  // Reservas confirmadas con entrada en las proximas 24h y sin ningun pago confirmado.
  const { rows } = await pool.query<{
    booking_id: number; codigo: string;
    customer_nombres: string; customer_apellidos: string;
    room_numero: string;
    fecha_entrada: Date; importe_total: string; moneda: string;
    hours_until: number;
  }>(
    `SELECT b.id AS booking_id, b.codigo,
            c.nombres AS customer_nombres, c.apellidos AS customer_apellidos,
            r.numero AS room_numero,
            b.fecha_entrada, b.importe_total::text, b.moneda,
            EXTRACT(EPOCH FROM (b.fecha_entrada - NOW())) / 3600 AS hours_until
       FROM bookings b
       JOIN customers c ON c.id = b.customer_id
       JOIN rooms r ON r.id = b.room_id
      WHERE b.status IN ('pendiente','confirmada')
        AND b.fecha_entrada > NOW()
        AND b.fecha_entrada < NOW() + INTERVAL '24 hours'
        AND b.payment_status = 'pendiente'
      ORDER BY b.fecha_entrada ASC
      LIMIT 20`,
  );
  return rows.map((r) => ({
    booking_id: r.booking_id,
    codigo: r.codigo,
    customer_nombre: `${r.customer_nombres} ${r.customer_apellidos}`,
    room_numero: r.room_numero,
    fecha_entrada: r.fecha_entrada.toISOString(),
    importe_total: Number(r.importe_total),
    moneda: r.moneda,
    hours_until_checkin: Math.max(0, Math.round(Number(r.hours_until) * 10) / 10),
  }));
}

async function loadKpis(arrivals: ArrivalToday[], departures: DepartureToday[], rooms: RoomBoardItem[], pending: PendingPaymentItem[], cleanings: CleaningPending[]): Promise<TodayKpis> {
  const total = rooms.length;
  const occupied = rooms.filter((r) => r.status === 'ocupada').length;
  const pct = total > 0 ? Math.round((occupied / total) * 1000) / 10 : 0;
  return {
    arrivals_count: arrivals.length,
    departures_count: departures.length,
    occupancy_pct: pct,
    rooms_total: total,
    rooms_occupied: occupied,
    pending_payments_count: pending.length,
    cleanings_pending_count: cleanings.length,
  };
}

export async function getToday(targetDate?: string): Promise<DashboardPayload> {
  const today = targetDate ?? new Date().toISOString().slice(0, 10);

  const [arrivals, departures, cleanings, birthdays, rooms, pendingPayments, withoutPayment] = await Promise.all([
    loadArrivals(today),
    loadDepartures(today),
    loadCleanings(),
    loadBirthdays(today),
    loadRoomsBoard(),
    loadPendingPayments(),
    loadBookingsWithoutPayment(),
  ]);

  const kpis = await loadKpis(arrivals, departures, rooms, pendingPayments, cleanings);

  return {
    kpis,
    today: { arrivals, departures, cleanings_pending: cleanings, birthdays },
    rooms_board: rooms,
    inbox: {
      pending_payments: pendingPayments,
      bookings_without_payment: withoutPayment,
    },
    generated_at: new Date().toISOString(),
  };
}
