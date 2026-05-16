import { z } from 'zod';

export const DOC_KINDS = ['dni', 'pasaporte', 'cedula', 'licencia', 'otro'] as const;
export const SEGMENTS = ['vip', 'inactivos', 'birthdays_month', 'recientes'] as const;

export const createCustomerSchema = z.object({
  nombres: z.string().trim().min(1).max(150),
  apellidos: z.string().trim().min(1).max(150),
  doc_kind: z.enum(DOC_KINDS).default('otro'),
  doc_numero: z.string().trim().min(1).max(50),
  email: z.string().email().toLowerCase().max(255).optional().nullable(),
  telefono: z.string().trim().max(50).optional().nullable(),
  fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  nacionalidad: z.string().trim().max(100).optional().nullable(),
  direccion: z.string().trim().max(2000).optional().nullable(),
  preferencias: z.record(z.unknown()).default({}),
  notas: z.string().trim().max(2000).optional().nullable(),
  accepts_marketing: z.boolean().default(false),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  active: z.boolean().optional(),
});

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().optional(),
  doc_kind: z.enum(DOC_KINDS).optional(),
  segment: z.enum(SEGMENTS).optional(),
  accepts_marketing: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
