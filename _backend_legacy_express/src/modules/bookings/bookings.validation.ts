import { z } from 'zod';

export const PERIODS = ['dia', 'semana', 'mes'] as const;
export const STATUSES = ['pendiente', 'confirmada', 'en_curso', 'finalizada', 'cancelada', 'no_show'] as const;
export const METHODS = [
  'efectivo',
  'tarjeta',
  'transferencia',
  'paypal',
  'otro',
  'pago_movil',
  'zelle',
  'punto_venta',
  'efectivo_usd',
  'efectivo_bs',
] as const;

const isoDateTime = z.string().datetime({ offset: true });

export const createBookingSchema = z.object({
  customer_id: z.coerce.number().int().positive(),
  room_id: z.coerce.number().int().positive(),
  period: z.enum(PERIODS).default('dia'),
  fecha_entrada: isoDateTime,
  fecha_salida: isoDateTime,
  huespedes: z.coerce.number().int().min(1).default(1),
  descuento_pct: z.coerce.number().min(0).max(100).default(0),
  descuento_monto: z.coerce.number().nonnegative().default(0),
  notas: z.string().trim().max(2000).optional().nullable(),
}).refine((d) => new Date(d.fecha_salida) > new Date(d.fecha_entrada), {
  message: 'fecha_salida debe ser posterior a fecha_entrada',
  path: ['fecha_salida'],
});

export const updateBookingSchema = z.object({
  huespedes: z.coerce.number().int().min(1).optional(),
  notas: z.string().trim().max(2000).optional().nullable(),
});

export const moveBookingSchema = z.object({
  room_id: z.coerce.number().int().positive().optional(),
  fecha_entrada: isoDateTime.optional(),
  fecha_salida: isoDateTime.optional(),
}).refine(
  (d) => d.room_id !== undefined || d.fecha_entrada !== undefined || d.fecha_salida !== undefined,
  { message: 'Debe especificar al menos room_id, fecha_entrada o fecha_salida' },
);

export const cancelSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const listBookingsQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  room_id: z.coerce.number().int().positive().optional(),
  period: z.enum(PERIODS).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const calendarQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const availabilityQuerySchema = z.object({
  dateFrom: isoDateTime,
  dateTo: isoDateTime,
  room_type_id: z.coerce.number().int().positive().optional(),
  huespedes: z.coerce.number().int().min(1).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;
export type MoveBookingInput = z.infer<typeof moveBookingSchema>;
export type CancelInput = z.infer<typeof cancelSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
