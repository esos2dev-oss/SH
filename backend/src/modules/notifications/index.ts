// Modulo notifications: alertas operativas en vivo (via polling).
// Devuelve la bandeja persistente: pagos por confirmar, checkouts vencidos,
// limpiezas largas, reservas sin pago proximas, mantenimientos.

import { Router } from 'express';
import { pool } from '../../shared/config/db.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { ok } from '../../shared/utils/response.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';

export type NotificationSeverity = 'info' | 'warning' | 'error';
export type NotificationKind =
  | 'payment_pending'
  | 'checkout_overdue'
  | 'cleaning_long'
  | 'booking_no_payment'
  | 'maintenance';

export interface Notification {
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  url: string;
  entity_id: number;
  created_at: string;
}

const router = Router();
router.use(verifyToken);

router.get(
  '/active',
  roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']),
  asyncHandler(async (_req, res) => {
    const notifications: Notification[] = [];

    // Pagos por confirmar
    const { rows: pending } = await pool.query<{
      id: number; monto: string; moneda: string; method: string; referencia: string | null;
      booking_codigo: string | null; created_at: Date;
    }>(
      `SELECT p.id, p.monto::text, p.moneda, p.method, p.referencia, b.codigo AS booking_codigo, p.created_at
         FROM booking_payments p
         LEFT JOIN bookings b ON b.id = p.booking_id
        WHERE p.status = 'pending_confirmation'
        ORDER BY p.pagado_at DESC
        LIMIT 20`,
    );
    for (const p of pending) {
      notifications.push({
        kind: 'payment_pending',
        severity: 'warning',
        title: `Pago por confirmar: ${p.monto} ${p.moneda}`,
        detail: `${p.method}${p.referencia ? ` · ref ${p.referencia}` : ''}${p.booking_codigo ? ` · ${p.booking_codigo}` : ''}`,
        url: '/payments?status=pending_confirmation',
        entity_id: p.id,
        created_at: p.created_at.toISOString(),
      });
    }

    // Check-outs vencidos (fecha_salida pasada y status en_curso)
    const { rows: overdue } = await pool.query<{
      id: number; codigo: string; room_numero: string; customer: string; fecha_salida: Date;
    }>(
      `SELECT b.id, b.codigo, r.numero AS room_numero,
              (c.nombres || ' ' || c.apellidos) AS customer, b.fecha_salida
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         JOIN rooms r ON r.id = b.room_id
        WHERE b.status = 'en_curso'
          AND b.fecha_salida < NOW()
        ORDER BY b.fecha_salida ASC
        LIMIT 20`,
    );
    for (const b of overdue) {
      const hoursLate = Math.round((Date.now() - b.fecha_salida.getTime()) / 3_600_000);
      notifications.push({
        kind: 'checkout_overdue',
        severity: 'error',
        title: `Check-out vencido: ${b.codigo}`,
        detail: `${b.customer} · Hab. ${b.room_numero} · ${hoursLate}h tarde`,
        url: `/bookings/${b.id}`,
        entity_id: b.id,
        created_at: b.fecha_salida.toISOString(),
      });
    }

    // Limpiezas largas (> 60 min)
    const { rows: cleanings } = await pool.query<{
      id: number; numero: string; updated_at: Date;
    }>(
      `SELECT id, numero, updated_at
         FROM rooms
        WHERE status = 'limpieza'
          AND updated_at < NOW() - INTERVAL '60 minutes'
        ORDER BY updated_at ASC
        LIMIT 20`,
    );
    for (const r of cleanings) {
      const minutes = Math.round((Date.now() - r.updated_at.getTime()) / 60_000);
      notifications.push({
        kind: 'cleaning_long',
        severity: 'warning',
        title: `Hab. ${r.numero} en limpieza > 60 min`,
        detail: `${Math.floor(minutes / 60)}h ${minutes % 60}m esperando`,
        url: '/cleaning',
        entity_id: r.id,
        created_at: r.updated_at.toISOString(),
      });
    }

    // Reservas sin pago proximas (24h)
    const { rows: noPay } = await pool.query<{
      id: number; codigo: string; customer: string; room_numero: string; fecha_entrada: Date;
    }>(
      `SELECT b.id, b.codigo, (c.nombres || ' ' || c.apellidos) AS customer,
              r.numero AS room_numero, b.fecha_entrada
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         JOIN rooms r ON r.id = b.room_id
        WHERE b.status IN ('pendiente','confirmada')
          AND b.fecha_entrada > NOW()
          AND b.fecha_entrada < NOW() + INTERVAL '12 hours'
          AND b.payment_status = 'pendiente'
        ORDER BY b.fecha_entrada ASC
        LIMIT 10`,
    );
    for (const b of noPay) {
      const hours = Math.round((b.fecha_entrada.getTime() - Date.now()) / 3_600_000);
      notifications.push({
        kind: 'booking_no_payment',
        severity: 'warning',
        title: `Reserva sin pago: ${b.codigo}`,
        detail: `${b.customer} · Hab. ${b.room_numero} · llega en ${hours}h`,
        url: `/bookings/${b.id}`,
        entity_id: b.id,
        created_at: new Date().toISOString(),
      });
    }

    // Mantenimientos pendientes
    const { rows: maint } = await pool.query<{
      id: number; numero: string; notas: string | null; updated_at: Date;
    }>(
      `SELECT id, numero, notas, updated_at
         FROM rooms
        WHERE status = 'mantenimiento'
        ORDER BY updated_at ASC
        LIMIT 10`,
    );
    for (const r of maint) {
      notifications.push({
        kind: 'maintenance',
        severity: 'info',
        title: `Hab. ${r.numero} en mantenimiento`,
        detail: r.notas ?? 'Sin notas',
        url: '/rooms',
        entity_id: r.id,
        created_at: r.updated_at.toISOString(),
      });
    }

    // Ordenar: errores primero, despues warnings, despues info; dentro de cada nivel por fecha
    const severityWeight = { error: 0, warning: 1, info: 2 };
    notifications.sort((a, b) => {
      const sw = severityWeight[a.severity] - severityWeight[b.severity];
      if (sw !== 0) return sw;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    ok(res, {
      count: notifications.length,
      bySeverity: {
        error: notifications.filter((n) => n.severity === 'error').length,
        warning: notifications.filter((n) => n.severity === 'warning').length,
        info: notifications.filter((n) => n.severity === 'info').length,
      },
      items: notifications,
      generated_at: new Date().toISOString(),
    });
  }),
);

export default { prefix: '/api/notifications', router };
