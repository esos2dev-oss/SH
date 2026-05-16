// Modulo search: busqueda global rapida (command palette).
// Busca por habitacion, reserva, huesped en una sola query.

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { ok } from '../../shared/utils/response.js';
import { Errors } from '../../shared/utils/app-error.js';
import { verifyToken } from '../../shared/middleware/auth.js';
import { roleGuard } from '../../shared/middleware/role-guard.js';
import { pool } from '../../shared/config/db.js';

export interface SearchHit {
  kind: 'room' | 'booking' | 'customer' | 'payment';
  id: number;
  label: string;
  hint: string;
  url: string;
}

const querySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

async function searchRooms(q: string, limit: number): Promise<SearchHit[]> {
  const param = `%${q.toLowerCase()}%`;
  const { rows } = await pool.query<{ id: number; numero: string; planta: string | null; status: string; type: string }>(
    `SELECT r.id, r.numero, r.planta, r.status, rt.nombre AS type
       FROM rooms r
       JOIN room_types rt ON rt.id = r.room_type_id
      WHERE r.active = true
        AND LOWER(r.numero) LIKE $1
      ORDER BY r.numero
      LIMIT $2`,
    [param, limit],
  );
  return rows.map((r) => ({
    kind: 'room' as const,
    id: r.id,
    label: `Habitacion ${r.numero}`,
    hint: `${r.type}${r.planta ? ` · Planta ${r.planta}` : ''} · ${r.status}`,
    url: '/rooms',
  }));
}

async function searchBookings(q: string, limit: number): Promise<SearchHit[]> {
  const param = `%${q.toLowerCase()}%`;
  const { rows } = await pool.query<{ id: number; codigo: string; status: string; cn: string; ca: string; rn: string }>(
    `SELECT b.id, b.codigo, b.status, c.nombres AS cn, c.apellidos AS ca, r.numero AS rn
       FROM bookings b
       JOIN customers c ON c.id = b.customer_id
       JOIN rooms r ON r.id = b.room_id
      WHERE LOWER(b.codigo) LIKE $1
         OR LOWER(c.nombres || ' ' || c.apellidos) LIKE $1
         OR LOWER(c.doc_numero) LIKE $1
         OR LOWER(r.numero) LIKE $1
      ORDER BY b.fecha_entrada DESC
      LIMIT $2`,
    [param, limit],
  );
  return rows.map((r) => ({
    kind: 'booking' as const,
    id: r.id,
    label: `Reserva ${r.codigo}`,
    hint: `${r.cn} ${r.ca} · Hab. ${r.rn} · ${r.status}`,
    url: `/bookings/${r.id}`,
  }));
}

async function searchCustomers(q: string, limit: number): Promise<SearchHit[]> {
  const param = `%${q.toLowerCase()}%`;
  const { rows } = await pool.query<{ id: number; nombres: string; apellidos: string; doc_numero: string; telefono: string | null; email: string | null }>(
    `SELECT id, nombres, apellidos, doc_numero, telefono, email
       FROM customers
      WHERE active = true
        AND (LOWER(nombres || ' ' || apellidos) LIKE $1
             OR LOWER(doc_numero) LIKE $1
             OR LOWER(COALESCE(telefono, '')) LIKE $1
             OR LOWER(COALESCE(email, '')) LIKE $1)
      ORDER BY apellidos, nombres
      LIMIT $2`,
    [param, limit],
  );
  return rows.map((r) => ({
    kind: 'customer' as const,
    id: r.id,
    label: `${r.nombres} ${r.apellidos}`,
    hint: `${r.doc_numero}${r.telefono ? ` · ${r.telefono}` : ''}${r.email ? ` · ${r.email}` : ''}`,
    url: `/customers/${r.id}`,
  }));
}

async function searchPayments(q: string, limit: number): Promise<SearchHit[]> {
  const param = `%${q.toLowerCase()}%`;
  const { rows } = await pool.query<{ id: number; method: string; monto: string; moneda: string; referencia: string | null; codigo: string | null }>(
    `SELECT p.id, p.method, p.monto::text, p.moneda, p.referencia, b.codigo
       FROM booking_payments p
       LEFT JOIN bookings b ON b.id = p.booking_id
      WHERE LOWER(COALESCE(p.referencia, '')) LIKE $1
         OR LOWER(COALESCE(b.codigo, '')) LIKE $1
      ORDER BY p.pagado_at DESC
      LIMIT $2`,
    [param, limit],
  );
  return rows.map((r) => ({
    kind: 'payment' as const,
    id: r.id,
    label: `Pago ${r.monto} ${r.moneda}`,
    hint: `${r.method}${r.referencia ? ` · ref ${r.referencia}` : ''}${r.codigo ? ` · ${r.codigo}` : ''}`,
    url: '/payments',
  }));
}

const router = Router();
router.use(verifyToken);

router.get(
  '/',
  roleGuard(['superadmin', 'admin', 'recepcion', 'contabilidad']),
  asyncHandler(async (req, res) => {
    const q = querySchema.parse(req.query);
    if (!req.user) throw Errors.unauthorized();
    const perKind = Math.max(3, Math.floor(q.limit / 4));
    const [rooms, bookings, customers, payments] = await Promise.all([
      searchRooms(q.q, perKind),
      searchBookings(q.q, perKind),
      searchCustomers(q.q, perKind),
      searchPayments(q.q, perKind),
    ]);
    const all: SearchHit[] = [...bookings, ...customers, ...rooms, ...payments];
    ok(res, all.slice(0, q.limit));
  }),
);

export default { prefix: '/api/search', router };
