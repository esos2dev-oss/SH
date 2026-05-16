import { z } from 'zod';

export const createRoomTypeSchema = z.object({
  nombre: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9_-]+$/, 'slug solo a-z, 0-9, _ y -'),
  descripcion: z.string().trim().max(2000).optional().nullable(),
  capacidad: z.coerce.number().int().positive(),
  tarifa_dia: z.coerce.number().nonnegative(),
  tarifa_semana: z.coerce.number().nonnegative().optional().nullable(),
  tarifa_mes: z.coerce.number().nonnegative().optional().nullable(),
  moneda: z.string().length(3).default('USD'),
  amenities: z.array(z.string().trim().min(1)).default([]),
});

export const updateRoomTypeSchema = createRoomTypeSchema.partial().extend({
  active: z.boolean().optional(),
});

export const listRoomTypesQuerySchema = z.object({
  active: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  search: z.string().trim().optional(),
});

export type CreateRoomTypeInput = z.infer<typeof createRoomTypeSchema>;
export type UpdateRoomTypeInput = z.infer<typeof updateRoomTypeSchema>;
export type ListRoomTypesQuery = z.infer<typeof listRoomTypesQuerySchema>;
