import { z } from 'zod';

export const ROLES = ['superadmin', 'admin', 'recepcion', 'limpieza', 'contabilidad'] as const;

export const createUserSchema = z.object({
  nombre: z.string().trim().min(2).max(200),
  email: z.string().email().toLowerCase().max(255),
  role: z.enum(ROLES).default('recepcion'),
});

export const updateUserSchema = z.object({
  nombre: z.string().trim().min(2).max(200).optional(),
  email: z.string().email().toLowerCase().max(255).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
});

export const listUsersQuerySchema = z.object({
  role: z.enum(ROLES).optional(),
  active: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
