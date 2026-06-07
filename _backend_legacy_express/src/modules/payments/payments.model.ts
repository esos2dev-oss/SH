// SQL del modulo payments. Sin logica de negocio: solo queries.

import type { PoolClient } from 'pg';
import { pool } from '../../shared/config/db.js';
import type { PaymentRow, PaymentWithJoins, PaymentConfirmationStatus } from './payments.types.js';
import type { ListPaymentsQuery } from './payments.validation.js';

type Exec = Pick<PoolClient, 'query'> | typeof pool;

const SELECT_JOINS = `
  SELECT p.*,
         b.codigo  AS booking_codigo,
         b.status  AS booking_status,
         COALESCE(c.id, bc.id)                 AS join_customer_id,
         COALESCE(c.nombres,   bc.nombres)     AS customer_nombres,
         COALESCE(c.apellidos, bc.apellidos)   AS customer_apellidos,
         COALESCE(c.telefono,  bc.telefono)    AS customer_telefono,
         COALESCE(c.doc_numero, bc.doc_numero) AS customer_doc_numero
    FROM booking_payments p
    LEFT JOIN bookings   b  ON b.id = p.booking_id
    LEFT JOIN customers  bc ON bc.id = b.customer_id
    LEFT JOIN customers  c  ON c.id = p.customer_id
`;

export async function list(filters: ListPaymentsQuery, exec: Exec = pool): Promise<{ items: PaymentWithJoins[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.status) { params.push(filters.status); where.push(`p.status = $${params.length}`); }
  if (filters.method) { params.push(filters.method); where.push(`p.method = $${params.length}`); }
  if (filters.booking_id) { params.push(filters.booking_id); where.push(`p.booking_id = $${params.length}`); }
  if (filters.customer_id) {
    params.push(filters.customer_id);
    const i = params.length;
    where.push(`(p.customer_id = $${i} OR b.customer_id = $${i})`);
  }
  if (filters.dateFrom) { params.push(filters.dateFrom); where.push(`p.pagado_at >= $${params.length}::date`); }
  if (filters.dateTo) { params.push(filters.dateTo); where.push(`p.pagado_at <= ($${params.length}::date + INTERVAL '1 day')`); }
  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    const i = params.length;
    where.push(`(
      LOWER(p.referencia) LIKE $${i}
      OR LOWER(COALESCE(b.codigo,'')) LIKE $${i}
      OR LOWER(COALESCE(c.nombres,'') || ' ' || COALESCE(c.apellidos,'') || ' ' || COALESCE(bc.nombres,'') || ' ' || COALESCE(bc.apellidos,'')) LIKE $${i}
      OR LOWER(COALESCE(c.doc_numero,'') || COALESCE(bc.doc_numero,'')) LIKE $${i}
    )`);
  }
  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countSQL = `
    SELECT COUNT(*)::int AS total
      FROM booking_payments p
      LEFT JOIN bookings  b  ON b.id = p.booking_id
      LEFT JOIN customers bc ON bc.id = b.customer_id
      LEFT JOIN customers c  ON c.id = p.customer_id
     ${whereSQL}
  `;
  const { rows: countRows } = await exec.query<{ total: number }>(countSQL, params);
  const total = countRows[0]?.total ?? 0;

  const offset = (filters.page - 1) * filters.limit;
  params.push(filters.limit, offset);
  const sql = `
    ${SELECT_JOINS}
    ${whereSQL}
    ORDER BY p.pagado_at DESC, p.id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows } = await exec.query<PaymentWithJoins>(sql, params);
  return { items: rows, total };
}

export async function findById(id: number, exec: Exec = pool): Promise<PaymentWithJoins | null> {
  const { rows } = await exec.query<PaymentWithJoins>(`${SELECT_JOINS} WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}

export interface InsertPaymentData {
  booking_id: number | null;
  customer_id: number | null;
  monto: number;
  moneda: string;
  monto_base: number | null;
  tasa_cambio: number | null;
  method: string;
  method_details: Record<string, unknown>;
  referencia: string | null;
  pagado_at: string | null;
  registered_by: number;
  ledger_entry_id: number | null;
  status: PaymentConfirmationStatus;
  notas: string | null;
  receipt_url?: string | null;
  receipt_mime?: string | null;
}

export async function insert(data: InsertPaymentData, exec: Exec = pool): Promise<PaymentRow> {
  const { rows } = await exec.query<PaymentRow>(
    `INSERT INTO booking_payments
       (booking_id, customer_id, monto, moneda, monto_base, tasa_cambio, method, method_details,
        referencia, pagado_at, registered_by, ledger_entry_id, status, notas,
        receipt_url, receipt_mime,
        confirmed_at, confirmed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9,
             COALESCE($10::timestamptz, NOW()), $11, $12, $13, $14, $15, $16,
             CASE WHEN $13 = 'confirmed' THEN NOW() ELSE NULL END,
             CASE WHEN $13 = 'confirmed' THEN $11 ELSE NULL END)
     RETURNING *`,
    [
      data.booking_id,
      data.customer_id,
      data.monto,
      data.moneda,
      data.monto_base,
      data.tasa_cambio,
      data.method,
      JSON.stringify(data.method_details),
      data.referencia,
      data.pagado_at,
      data.registered_by,
      data.ledger_entry_id,
      data.status,
      data.notas,
      data.receipt_url ?? null,
      data.receipt_mime ?? null,
    ],
  );
  if (!rows[0]) throw new Error('No se pudo crear payment');
  return rows[0];
}

export async function setConfirmed(id: number, actorId: number, exec: Exec = pool): Promise<PaymentRow | null> {
  const { rows } = await exec.query<PaymentRow>(
    `UPDATE booking_payments
        SET status = 'confirmed',
            confirmed_at = NOW(),
            confirmed_by = $2,
            rejected_at = NULL,
            rejected_by = NULL,
            rejected_reason = NULL
      WHERE id = $1
      RETURNING *`,
    [id, actorId],
  );
  return rows[0] ?? null;
}

export async function setRejected(id: number, actorId: number, reason: string, exec: Exec = pool): Promise<PaymentRow | null> {
  const { rows } = await exec.query<PaymentRow>(
    `UPDATE booking_payments
        SET status = 'rejected',
            rejected_at = NOW(),
            rejected_by = $2,
            rejected_reason = $3
      WHERE id = $1
      RETURNING *`,
    [id, actorId, reason],
  );
  return rows[0] ?? null;
}

export async function updateBasic(id: number, fields: Partial<{ notas: string | null; referencia: string | null }>, exec: Exec = pool): Promise<PaymentRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.notas !== undefined) { params.push(fields.notas); sets.push(`notas = $${params.length}`); }
  if (fields.referencia !== undefined) { params.push(fields.referencia); sets.push(`referencia = $${params.length}`); }
  if (!sets.length) {
    const { rows } = await exec.query<PaymentRow>(`SELECT * FROM booking_payments WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }
  params.push(id);
  const { rows } = await exec.query<PaymentRow>(
    `UPDATE booking_payments SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0] ?? null;
}

// ----- Statement helpers -----

export interface BookingForStatementRow {
  id: number;
  codigo: string;
  status: string;
  fecha_entrada: Date;
  fecha_salida: Date;
  importe_total: string;
  importe_pagado: string;
  moneda: string;
  customer_id: number;
}

export async function bookingsByCustomer(customerId: number, exec: Exec = pool): Promise<BookingForStatementRow[]> {
  const { rows } = await exec.query<BookingForStatementRow>(
    `SELECT id, codigo, status, fecha_entrada, fecha_salida, importe_total, importe_pagado, moneda, customer_id
       FROM bookings
      WHERE customer_id = $1
      ORDER BY fecha_entrada DESC`,
    [customerId],
  );
  return rows;
}

export async function paymentsByBooking(bookingId: number, exec: Exec = pool): Promise<PaymentRow[]> {
  const { rows } = await exec.query<PaymentRow>(
    `SELECT * FROM booking_payments
      WHERE booking_id = $1
      ORDER BY pagado_at ASC, id ASC`,
    [bookingId],
  );
  return rows;
}

export async function loosePaymentsByCustomer(customerId: number, exec: Exec = pool): Promise<PaymentRow[]> {
  const { rows } = await exec.query<PaymentRow>(
    `SELECT * FROM booking_payments
      WHERE customer_id = $1 AND booking_id IS NULL
      ORDER BY pagado_at DESC`,
    [customerId],
  );
  return rows;
}

// ----- Lookup para autocompletado del modal rapido -----

export interface QuickLookupRow {
  kind: 'booking' | 'customer';
  id: number;
  label: string;
  hint: string;
  booking_id: number | null;
  customer_id: number | null;
  room_numero: string | null;
  importe_pendiente: number;
  moneda: string | null;
}

export async function quickLookup(q: string, exec: Exec = pool): Promise<QuickLookupRow[]> {
  const param = `%${q.toLowerCase()}%`;
  const sql = `
    WITH activos AS (
      SELECT b.id            AS booking_id,
             c.id            AS customer_id,
             b.codigo,
             b.importe_total::numeric - b.importe_pagado::numeric AS importe_pendiente,
             b.moneda,
             r.numero        AS room_numero,
             c.nombres, c.apellidos, c.telefono, c.doc_numero
        FROM bookings b
        JOIN customers c ON c.id = b.customer_id
        JOIN rooms     r ON r.id = b.room_id
       WHERE b.status IN ('pendiente','confirmada','en_curso')
    )
    SELECT 'booking'::text AS kind,
           booking_id      AS id,
           ('Reserva ' || codigo || ' · Hab. ' || room_numero || ' · ' || nombres || ' ' || apellidos) AS label,
           ('Pendiente: ' || importe_pendiente::text || ' ' || moneda) AS hint,
           booking_id, customer_id, room_numero, importe_pendiente::float8, moneda
      FROM activos
     WHERE LOWER(codigo) LIKE $1
        OR LOWER(room_numero) LIKE $1
        OR LOWER(COALESCE(doc_numero,'')) LIKE $1
        OR LOWER(COALESCE(telefono,''))   LIKE $1
        OR LOWER(nombres || ' ' || apellidos) LIKE $1
    UNION ALL
    SELECT 'customer'::text AS kind,
           c.id             AS id,
           (c.nombres || ' ' || c.apellidos || COALESCE(' · ' || c.doc_numero,'')) AS label,
           COALESCE('Tel ' || c.telefono,'Sin reserva activa') AS hint,
           NULL::bigint, c.id, NULL::varchar, 0::float8, NULL::char(3)
      FROM customers c
     WHERE c.active = true
       AND (LOWER(COALESCE(c.doc_numero,'')) LIKE $1
            OR LOWER(COALESCE(c.telefono,''))  LIKE $1
            OR LOWER(c.nombres || ' ' || c.apellidos) LIKE $1
            OR LOWER(COALESCE(c.email,'')) LIKE $1)
     LIMIT 30
  `;
  const { rows } = await exec.query<QuickLookupRow>(sql, [param]);
  return rows;
}

// ----- Booking helpers -----

export interface BookingPaymentSyncRow {
  id: number;
  importe_total: string;
  importe_pagado_calc: string;
  moneda: string;
  customer_id: number;
  codigo: string;
}

export async function bookingForPayment(bookingId: number, exec: Exec = pool): Promise<BookingPaymentSyncRow | null> {
  const { rows } = await exec.query<BookingPaymentSyncRow>(
    `SELECT b.id,
            b.importe_total,
            COALESCE(SUM(CASE WHEN p.status IN ('confirmed','pending_confirmation') THEN p.monto ELSE 0 END), 0)::text AS importe_pagado_calc,
            b.moneda,
            b.customer_id,
            b.codigo
       FROM bookings b
       LEFT JOIN booking_payments p ON p.booking_id = b.id
      WHERE b.id = $1
      GROUP BY b.id`,
    [bookingId],
  );
  return rows[0] ?? null;
}

export async function recomputeBookingPayment(bookingId: number, exec: Exec = pool): Promise<{ importe_pagado: number; payment_status: string } | null> {
  const { rows } = await exec.query<{ importe_total: string; sum_paid: string }>(
    `SELECT b.importe_total::text,
            COALESCE(SUM(CASE WHEN p.status IN ('confirmed','pending_confirmation') THEN p.monto ELSE 0 END),0)::text AS sum_paid
       FROM bookings b
       LEFT JOIN booking_payments p ON p.booking_id = b.id
      WHERE b.id = $1
      GROUP BY b.id`,
    [bookingId],
  );
  const r = rows[0];
  if (!r) return null;
  const total = Number(r.importe_total);
  const paid = Number(r.sum_paid);
  let status = 'pendiente';
  if (paid >= total && total > 0) status = 'pagado';
  else if (paid > 0) status = 'parcial';

  await exec.query(
    `UPDATE bookings SET importe_pagado = $1, payment_status = $2 WHERE id = $3`,
    [paid, status, bookingId],
  );
  return { importe_pagado: paid, payment_status: status };
}

// ----- Exchange rates -----

export interface ExchangeRateRow {
  fecha: Date;
  bs_per_usd: string;
  source: string;
  set_by: number | null;
  created_at: Date;
}

export async function getRate(fecha: string, exec: Exec = pool): Promise<ExchangeRateRow | null> {
  const { rows } = await exec.query<ExchangeRateRow>(
    `SELECT * FROM exchange_rates WHERE fecha = $1::date`,
    [fecha],
  );
  return rows[0] ?? null;
}

export async function latestRate(exec: Exec = pool): Promise<ExchangeRateRow | null> {
  const { rows } = await exec.query<ExchangeRateRow>(
    `SELECT * FROM exchange_rates ORDER BY fecha DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function upsertRate(fecha: string, bsPerUsd: number, source: string, actorId: number, exec: Exec = pool): Promise<ExchangeRateRow> {
  const { rows } = await exec.query<ExchangeRateRow>(
    `INSERT INTO exchange_rates (fecha, bs_per_usd, source, set_by)
     VALUES ($1::date, $2, $3, $4)
     ON CONFLICT (fecha) DO UPDATE
        SET bs_per_usd = EXCLUDED.bs_per_usd,
            source     = EXCLUDED.source,
            set_by     = EXCLUDED.set_by
     RETURNING *`,
    [fecha, bsPerUsd, source, actorId],
  );
  if (!rows[0]) throw new Error('No se pudo upsert exchange_rate');
  return rows[0];
}

export async function listRates(limit: number, exec: Exec = pool): Promise<ExchangeRateRow[]> {
  const { rows } = await exec.query<ExchangeRateRow>(
    `SELECT * FROM exchange_rates ORDER BY fecha DESC LIMIT $1`,
    [limit],
  );
  return rows;
}
