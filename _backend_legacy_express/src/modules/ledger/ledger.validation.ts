import { z } from 'zod';

export const TYPES = ['ingreso', 'egreso'] as const;
export const STATUSES = ['registrado', 'conciliado', 'anulado'] as const;
export const METHODS = ['efectivo', 'tarjeta', 'transferencia', 'paypal', 'otro'] as const;
export const GROUP_BY = ['day', 'week', 'month'] as const;

export const createLedgerSchema = z.object({
  type: z.enum(TYPES),
  category_id: z.coerce.number().int().positive(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  descripcion: z.string().trim().min(1).max(500),
  monto: z.coerce.number().positive(),
  moneda: z.string().length(3).default('USD'),
  method: z.enum(METHODS).optional().nullable(),
  booking_id: z.coerce.number().int().positive().optional().nullable(),
  customer_id: z.coerce.number().int().positive().optional().nullable(),
});

export const listLedgerQuerySchema = z.object({
  type: z.enum(TYPES).optional(),
  category_id: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(STATUSES).optional(),
  booking_id: z.coerce.number().int().positive().optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const summaryQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  groupBy: z.enum(GROUP_BY).default('day'),
});

export type CreateLedgerInput = z.infer<typeof createLedgerSchema>;
export type ListLedgerQuery = z.infer<typeof listLedgerQuerySchema>;
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
