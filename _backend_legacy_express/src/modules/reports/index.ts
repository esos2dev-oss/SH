// Modulo reports: reportes financieros, occupancy, customers + export CSV.

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../shared/config/db.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import { logAudit } from '../../shared/services/audit.service.js';
import { summary } from '../ledger/ledger.model.js';

const PERIODS = ['daily', 'weekly', 'monthly'] as const;

const financialQuerySchema = z.object({
  period: z.enum(PERIODS).default('monthly'),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const occupancyQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const router = Router();
router.use(verifyToken);
router.use(roleGuard(['superadmin', 'admin', 'contabilidad']));

router.get('/financial', asyncHandler(async (req, res) => {
  const q = financialQuerySchema.parse(req.query);
  const groupBy = q.period === 'monthly' ? 'month' : q.period === 'weekly' ? 'week' : 'day';
  const result = await summary({ dateFrom: q.dateFrom, dateTo: q.dateTo, groupBy });

  // Bookings count en el rango
  const { rows: bookingsCount } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM bookings
      WHERE fecha_entrada >= $1::date AND fecha_entrada <= $2::date
        AND status NOT IN ('cancelada','no_show')`,
    [q.dateFrom, q.dateTo],
  );

  // Occupancy promedio (basado en snapshot actual — placeholder)
  const { rows: occRows } = await pool.query<{ rate: string }>(
    `SELECT (SUM(CASE WHEN status = 'ocupada' THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0))::text AS rate
       FROM rooms WHERE active = true`,
  );

  ok(res, {
    period: q.period,
    rangeFrom: q.dateFrom,
    rangeTo: q.dateTo,
    ...result,
    bookingsCount: Number(bookingsCount[0]?.count ?? 0),
    occupancyAvg: Number(occRows[0]?.rate ?? 0),
  });
}));

router.get('/financial.csv', asyncHandler(async (req, res) => {
  if (!req.user) throw Errors.unauthorized();
  const q = financialQuerySchema.parse(req.query);
  const { rows } = await pool.query<{
    fecha: Date; codigo: string; type: string; categoria: string; descripcion: string;
    monto: string; moneda: string; method: string | null;
  }>(
    `SELECT l.fecha, l.codigo, l.type, c.nombre AS categoria, l.descripcion,
            l.monto::text, l.moneda, l.method
       FROM ledger_entries l JOIN ledger_categories c ON c.id = l.category_id
      WHERE l.fecha BETWEEN $1 AND $2 AND l.status <> 'anulado'
      ORDER BY l.fecha, l.id`,
    [q.dateFrom, q.dateTo],
  );

  const escape = (s: unknown) => {
    const v = s === null || s === undefined ? '' : String(s);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };

  const header = ['Fecha', 'Codigo', 'Tipo', 'Categoria', 'Descripcion', 'Monto', 'Moneda', 'Metodo'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.fecha.toISOString().slice(0, 10),
        r.codigo,
        r.type,
        r.categoria,
        r.descripcion,
        r.monto,
        r.moneda,
        r.method ?? '',
      ].map(escape).join(','),
    );
  }

  await logAudit({ userId: req.user.id, action: 'export', entity: 'reports', after: { range: [q.dateFrom, q.dateTo] } });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="financial_${q.dateFrom}_${q.dateTo}.csv"`);
  res.send('﻿' + lines.join('\n'));
}));

router.get('/occupancy', asyncHandler(async (req, res) => {
  const q = occupancyQuerySchema.parse(req.query);
  // Bookings activos por dia en el rango (vista simple)
  const { rows } = await pool.query<{ day: string; ocupadas: string }>(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day,
            (SELECT COUNT(*)::text FROM bookings b
              WHERE b.status IN ('confirmada','en_curso','finalizada')
                AND b.fecha_entrada::date <= d AND b.fecha_salida::date > d) AS ocupadas
       FROM generate_series($1::date, $2::date, INTERVAL '1 day') d
      ORDER BY d`,
    [q.dateFrom, q.dateTo],
  );
  const { rows: total } = await pool.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM rooms WHERE active = true`);
  const totalRooms = Number(total[0]?.total ?? 0);
  ok(res, {
    rangeFrom: q.dateFrom,
    rangeTo: q.dateTo,
    totalRooms,
    series: rows.map((r) => ({
      day: r.day,
      ocupadas: Number(r.ocupadas),
      rate: totalRooms > 0 ? Number(r.ocupadas) / totalRooms : 0,
    })),
  });
}));

// KPIs hoteleros: ocupacion %, ADR, RevPAR
router.get('/kpis', asyncHandler(async (req, res) => {
  const q = occupancyQuerySchema.parse(req.query);

  const { rows: totRows } = await pool.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM rooms WHERE active = true`);
  const totalRooms = Number(totRows[0]?.total ?? 0);

  // Room-nights vendidas en el rango (suma de dias entre fecha_entrada y fecha_salida intersect rango)
  const { rows: rnRows } = await pool.query<{ room_nights: string; revenue: string }>(
    `SELECT COALESCE(SUM(
              GREATEST(
                LEAST(b.fecha_salida::date, $2::date + INTERVAL '1 day')
                - GREATEST(b.fecha_entrada::date, $1::date),
                0
              )::int
            ), 0)::text AS room_nights,
            COALESCE(SUM(b.importe_total),0)::text AS revenue
       FROM bookings b
      WHERE b.status IN ('confirmada','en_curso','finalizada')
        AND b.fecha_entrada::date <= $2::date
        AND b.fecha_salida::date > $1::date`,
    [q.dateFrom, q.dateTo],
  );
  const roomNights = Number(rnRows[0]?.room_nights ?? 0);
  const revenue = Number(rnRows[0]?.revenue ?? 0);

  // Dias en el rango
  const days = Math.max(1, Math.ceil((new Date(q.dateTo).getTime() - new Date(q.dateFrom).getTime()) / 86_400_000) + 1);
  const availableRoomNights = totalRooms * days;

  const occupancyPct = availableRoomNights > 0 ? (roomNights / availableRoomNights) * 100 : 0;
  const adr = roomNights > 0 ? revenue / roomNights : 0;
  const revpar = availableRoomNights > 0 ? revenue / availableRoomNights : 0;

  // Top room types por revenue
  const { rows: topTypes } = await pool.query<{ id: number; nombre: string; bookings: string; revenue: string }>(
    `SELECT rt.id, rt.nombre, COUNT(b.id)::text AS bookings, COALESCE(SUM(b.importe_total),0)::text AS revenue
       FROM room_types rt
       LEFT JOIN rooms r ON r.room_type_id = rt.id AND r.active = true
       LEFT JOIN bookings b ON b.room_id = r.id
         AND b.status IN ('confirmada','en_curso','finalizada')
         AND b.fecha_entrada::date <= $2::date
         AND b.fecha_salida::date > $1::date
      GROUP BY rt.id, rt.nombre
      ORDER BY revenue DESC NULLS LAST
      LIMIT 10`,
    [q.dateFrom, q.dateTo],
  );

  ok(res, {
    rangeFrom: q.dateFrom,
    rangeTo: q.dateTo,
    totalRooms,
    days,
    roomNights,
    availableRoomNights,
    revenue: Math.round(revenue * 100) / 100,
    occupancyPct: Math.round(occupancyPct * 100) / 100,
    adr: Math.round(adr * 100) / 100,
    revpar: Math.round(revpar * 100) / 100,
    topRoomTypes: topTypes.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      bookings: Number(r.bookings),
      revenue: Number(r.revenue),
    })),
  });
}));

// Ingresos por metodo de pago en el rango
router.get('/payment-methods', asyncHandler(async (req, res) => {
  const q = occupancyQuerySchema.parse(req.query);
  const { rows } = await pool.query<{ method: string; moneda: string; status: string; total: string; count: string }>(
    `SELECT method, moneda, status, COALESCE(SUM(monto),0)::text AS total, COUNT(*)::text AS count
       FROM booking_payments
      WHERE pagado_at::date BETWEEN $1::date AND $2::date
      GROUP BY method, moneda, status
      ORDER BY method, moneda`,
    [q.dateFrom, q.dateTo],
  );

  // Agregar por method
  type Bucket = { method: string; count: number; confirmed: Record<string, number>; pending: Record<string, number> };
  const byMethod = new Map<string, Bucket>();
  for (const r of rows) {
    let b = byMethod.get(r.method);
    if (!b) {
      b = { method: r.method, count: 0, confirmed: {}, pending: {} };
      byMethod.set(r.method, b);
    }
    b.count += Number(r.count);
    if (r.status === 'confirmed') {
      b.confirmed[r.moneda] = (b.confirmed[r.moneda] ?? 0) + Number(r.total);
    } else if (r.status === 'pending_confirmation') {
      b.pending[r.moneda] = (b.pending[r.moneda] ?? 0) + Number(r.total);
    }
  }
  ok(res, {
    rangeFrom: q.dateFrom,
    rangeTo: q.dateTo,
    by_method: Array.from(byMethod.values()),
  });
}));

router.get('/customers', asyncHandler(async (_req, res) => {
  const { rows: top } = await pool.query<{
    id: number; nombre: string; estancias: string; gastado: string;
  }>(
    `SELECT c.id,
            c.nombres || ' ' || c.apellidos AS nombre,
            COUNT(b.id)::text AS estancias,
            COALESCE(SUM(b.importe_pagado),0)::text AS gastado
       FROM customers c
       LEFT JOIN bookings b ON b.customer_id = c.id AND b.status IN ('finalizada','en_curso')
      WHERE c.active = true
      GROUP BY c.id
      ORDER BY gastado DESC NULLS LAST, estancias DESC NULLS LAST
      LIMIT 20`,
  );
  const { rows: segments } = await pool.query<{ vip: string; inactivos: string; recientes: string; cumple_mes: string }>(
    `SELECT
       (SELECT COUNT(*)::text FROM (
          SELECT c.id FROM customers c
            LEFT JOIN bookings b ON b.customer_id = c.id AND b.status IN ('finalizada','en_curso')
           WHERE c.active = true
           GROUP BY c.id HAVING COUNT(b.id) >= 3
       ) v) AS vip,
       (SELECT COUNT(*)::text FROM (
          SELECT c.id FROM customers c
            LEFT JOIN bookings b ON b.customer_id = c.id AND b.status IN ('finalizada','en_curso')
           WHERE c.active = true
           GROUP BY c.id
          HAVING (MAX(b.fecha_salida) IS NULL OR MAX(b.fecha_salida) < NOW() - INTERVAL '90 days')
       ) i) AS inactivos,
       (SELECT COUNT(*)::text FROM (
          SELECT c.id FROM customers c
            LEFT JOIN bookings b ON b.customer_id = c.id AND b.status IN ('finalizada','en_curso')
           WHERE c.active = true
           GROUP BY c.id HAVING MAX(b.fecha_salida) > NOW() - INTERVAL '30 days'
       ) r) AS recientes,
       (SELECT COUNT(*)::text FROM customers
         WHERE active = true AND fecha_nacimiento IS NOT NULL
           AND EXTRACT(MONTH FROM fecha_nacimiento) = EXTRACT(MONTH FROM NOW())
       ) AS cumple_mes`,
  );
  ok(res, {
    top: top.map((r) => ({ id: r.id, nombre: r.nombre, estancias: Number(r.estancias), gastado: Number(r.gastado) })),
    segments: segments[0] ?? { vip: 0, inactivos: 0, recientes: 0, cumple_mes: 0 },
  });
}));

export default { prefix: '/api/reports', router };
