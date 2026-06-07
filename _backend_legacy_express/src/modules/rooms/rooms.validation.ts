import { z } from 'zod';

export const ROOM_STATUS = ['disponible', 'ocupada', 'limpieza', 'mantenimiento', 'fuera_servicio'] as const;

export const createRoomSchema = z.object({
  numero: z.string().trim().min(1).max(20),
  room_type_id: z.coerce.number().int().positive(),
  planta: z.string().trim().max(20).optional().nullable(),
  status: z.enum(ROOM_STATUS).default('disponible'),
  notas: z.string().trim().max(2000).optional().nullable(),
  photo_url: z.string().url().max(500).optional().nullable(),
});

export const updateRoomSchema = createRoomSchema.partial().extend({
  active: z.boolean().optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(ROOM_STATUS),
  notas: z.string().trim().max(2000).optional().nullable(),
});

export const listRoomsQuerySchema = z.object({
  status: z.enum(ROOM_STATUS).optional(),
  room_type_id: z.coerce.number().int().positive().optional(),
  planta: z.string().trim().optional(),
  search: z.string().trim().optional(),
  active: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>;
