import { z } from 'zod';

export const createCheckInSchema = z.object({
  booking_id: z.coerce.number().int().positive(),
  observaciones: z.string().trim().max(2000).optional().nullable(),
  huespedes_acompaniantes: z.array(z.record(z.unknown())).default([]),
});

export const checkOutSchema = z.object({
  observaciones: z.string().trim().max(2000).optional().nullable(),
});

export type CreateCheckInInput = z.infer<typeof createCheckInSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
